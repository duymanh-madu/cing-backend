BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- PRIVATE TERMINAL TRANSITION AUTHORITY
--
-- Purpose:
--
--   canonical lethal combat state
--       ->
--   completed turn
--   completed combat
--   completed runtime
--   completed match
--
-- This function does NOT apply damage.
--
-- Combat Vital HP must already contain the authoritative
-- post-damage values when this primitive is called.
--
-- Winner / loser are NEVER caller supplied.
-- They are derived exclusively from:
--
--   canonical combat participants
--   +
--   canonical Combat Vital current HP
--
-- Valid lethal state:
--
--   exactly one participant HP = 0
--   other participant HP > 0
--
-- Invalid:
--
--   both alive
--   both at zero
--
-- This function is intentionally PRIVATE.
--
-- service_role receives NO EXECUTE privilege.
--
-- A future fenced Resolution Commit SECURITY DEFINER RPC
-- will call this primitive inside the SAME PostgreSQL
-- transaction after:
--
--   resolution validation
--   resolution persistence
--   damage / HP mutation
--
-- and before transaction commit.
--
-- PostgreSQL remains final gameplay authority.
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.cing_artillery_complete_combat_private(
    p_combat_state_id uuid,
    p_turn_state_id uuid,
    p_expected_turn_number integer
  )
RETURNS public.cing_artillery_combat_states
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_turn
    public.cing_artillery_turn_states%ROWTYPE;

  v_vital
    public.cing_artillery_combat_vital_states%ROWTYPE;

  v_runtime
    public.cing_artillery_match_runtimes%ROWTYPE;

  v_match
    public.cing_artillery_matches%ROWTYPE;

  v_winner_account_id uuid;
  v_loser_account_id uuid;

  v_completed_at timestamptz;

  v_updated_count integer;
BEGIN
  -- ===================================================
  -- CALL CONTRACT
  -- ===================================================

  IF p_combat_state_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_ID_REQUIRED';
  END IF;

  IF p_turn_state_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_TURN_STATE_ID_REQUIRED';
  END IF;

  IF p_expected_turn_number IS NULL
     OR p_expected_turn_number <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_TURN_NUMBER_INVALID';
  END IF;


  -- ===================================================
  -- CANONICAL GAMEPLAY LOCK ORDER
  --
  --   combat
  --     ->
  --   current turn
  --     ->
  --   combat vital
  --     ->
  --   runtime
  --     ->
  --   match
  --
  -- combat -> turn preserves the already-established
  -- shot / turn-advancement authority order.
  --
  -- Future resolution authority must acquire these same
  -- durable rows in this same order.
  -- ===================================================

  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.id =
    p_combat_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_FOUND';
  END IF;


  SELECT t.*
  INTO v_turn
  FROM public.cing_artillery_turn_states AS t
  WHERE t.id =
    p_turn_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_TURN_STATE_NOT_FOUND';
  END IF;


  -- ===================================================
  -- COMBAT / TURN IDENTITY + EXACT TURN FENCE
  -- ===================================================

  IF v_turn.combat_state_id <>
       v_combat.id
     OR v_turn.match_runtime_id <>
       v_combat.match_runtime_id
     OR v_turn.match_id <>
       v_combat.match_id
     OR v_turn.player_one_account_id <>
       v_combat.player_one_account_id
     OR v_turn.player_one_session_id <>
       v_combat.player_one_session_id
     OR v_turn.player_two_account_id <>
       v_combat.player_two_account_id
     OR v_turn.player_two_session_id <>
       v_combat.player_two_session_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TERMINAL_STATE_INCONSISTENT';
  END IF;


  IF v_combat.status <> 'initialized' THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_NOT_TERMINAL_ELIGIBLE';
  END IF;


  IF v_turn.status <> 'active'
     OR v_turn.turn_number <>
          p_expected_turn_number
     OR v_turn.active_account_id IS NULL
     OR v_turn.active_session_id IS NULL
     OR v_turn.initiative_reason NOT IN (
          'speed',
          'speed_tiebreak'
        )
     OR v_turn.turn_started_at IS NULL
     OR v_turn.turn_deadline_at IS NULL
     OR v_turn.turn_deadline_at <=
          v_turn.turn_started_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TURN_STATE_CONFLICT';
  END IF;


  -- ===================================================
  -- COMBAT VITAL AUTHORITY
  -- ===================================================

  SELECT v.*
  INTO v_vital
  FROM public.cing_artillery_combat_vital_states AS v
  WHERE v.combat_state_id =
    v_combat.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_VITAL_STATE_NOT_FOUND';
  END IF;


  IF v_vital.match_runtime_id <>
       v_combat.match_runtime_id
     OR v_vital.match_id <>
       v_combat.match_id
     OR v_vital.player_one_account_id <>
       v_combat.player_one_account_id
     OR v_vital.player_two_account_id <>
       v_combat.player_two_account_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_VITAL_STATE_INCONSISTENT';
  END IF;


  -- Database constraints already reject negative/non-finite
  -- HP. Revalidate terminal semantics here because winner
  -- authority depends on the exact lethal state.

  IF v_vital.player_one_current_hp = 0
     AND v_vital.player_two_current_hp > 0
  THEN
    v_winner_account_id :=
      v_combat.player_two_account_id;

    v_loser_account_id :=
      v_combat.player_one_account_id;

  ELSIF v_vital.player_two_current_hp = 0
        AND v_vital.player_one_current_hp > 0
  THEN
    v_winner_account_id :=
      v_combat.player_one_account_id;

    v_loser_account_id :=
      v_combat.player_two_account_id;

  ELSE
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_NOT_LETHAL';
  END IF;


  -- ===================================================
  -- RUNTIME AUTHORITY
  -- ===================================================

  SELECT r.*
  INTO v_runtime
  FROM public.cing_artillery_match_runtimes AS r
  WHERE r.id =
    v_combat.match_runtime_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_MATCH_RUNTIME_NOT_FOUND';
  END IF;


  IF v_runtime.match_id <>
       v_combat.match_id
     OR v_runtime.player_one_account_id <>
       v_combat.player_one_account_id
     OR v_runtime.player_one_session_id <>
       v_combat.player_one_session_id
     OR v_runtime.player_two_account_id <>
       v_combat.player_two_account_id
     OR v_runtime.player_two_session_id <>
       v_combat.player_two_session_id
     OR v_runtime.status <> 'ready'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_MATCH_RUNTIME_STATE_INCONSISTENT';
  END IF;


  -- ===================================================
  -- MATCH AUTHORITY
  -- ===================================================

  SELECT m.*
  INTO v_match
  FROM public.cing_artillery_matches AS m
  WHERE m.id =
    v_combat.match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_MATCH_NOT_FOUND';
  END IF;


  IF v_match.player_one_account_id <>
       v_combat.player_one_account_id
     OR v_match.player_one_session_id <>
       v_combat.player_one_session_id
     OR v_match.player_two_account_id <>
       v_combat.player_two_account_id
     OR v_match.player_two_session_id <>
       v_combat.player_two_session_id
     OR v_match.status <> 'matched'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_MATCH_STATE_INCONSISTENT';
  END IF;


  -- ===================================================
  -- SINGLE POSTGRESQL TERMINAL TIMESTAMP
  -- ===================================================

  v_completed_at :=
    clock_timestamp();


  -- ===================================================
  -- TERMINATE CURRENT TURN
  --
  -- Preserve:
  --   turn_number
  --   initiative_reason
  --
  -- Clear live-turn ownership and timer.
  -- ===================================================

  UPDATE public.cing_artillery_turn_states AS t
  SET
    status =
      'completed',

    active_account_id =
      NULL,

    active_session_id =
      NULL,

    turn_started_at =
      NULL,

    turn_deadline_at =
      NULL,

    completed_at =
      v_completed_at,

    updated_at =
      v_completed_at
  WHERE t.id =
      v_turn.id
    AND t.combat_state_id =
      v_combat.id
    AND t.status =
      'active'
    AND t.turn_number =
      p_expected_turn_number;

  GET DIAGNOSTICS
    v_updated_count =
      ROW_COUNT;

  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TERMINAL_TURN_UPDATE_CONFLICT';
  END IF;


  -- ===================================================
  -- COMPLETE COMBAT
  -- ===================================================

  UPDATE public.cing_artillery_combat_states AS c
  SET
    status =
      'completed',

    winner_account_id =
      v_winner_account_id,

    loser_account_id =
      v_loser_account_id,

    completion_reason =
      'hp_depleted',

    completed_at =
      v_completed_at,

    updated_at =
      v_completed_at
  WHERE c.id =
      v_combat.id
    AND c.status =
      'initialized';

  GET DIAGNOSTICS
    v_updated_count =
      ROW_COUNT;

  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TERMINAL_COMBAT_UPDATE_CONFLICT';
  END IF;


  -- ===================================================
  -- COMPLETE RUNTIME
  -- ===================================================

  UPDATE public.cing_artillery_match_runtimes AS r
  SET
    status =
      'completed',

    winner_account_id =
      v_winner_account_id,

    loser_account_id =
      v_loser_account_id,

    completion_reason =
      'hp_depleted',

    completed_at =
      v_completed_at,

    updated_at =
      v_completed_at
  WHERE r.id =
      v_runtime.id
    AND r.match_id =
      v_match.id
    AND r.status =
      'ready';

  GET DIAGNOSTICS
    v_updated_count =
      ROW_COUNT;

  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TERMINAL_RUNTIME_UPDATE_CONFLICT';
  END IF;


  -- ===================================================
  -- COMPLETE MATCH
  -- ===================================================

  UPDATE public.cing_artillery_matches AS m
  SET
    status =
      'completed',

    winner_account_id =
      v_winner_account_id,

    loser_account_id =
      v_loser_account_id,

    completion_reason =
      'hp_depleted',

    completed_at =
      v_completed_at,

    updated_at =
      v_completed_at
  WHERE m.id =
      v_match.id
    AND m.status =
      'matched';

  GET DIAGNOSTICS
    v_updated_count =
      ROW_COUNT;

  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TERMINAL_MATCH_UPDATE_CONFLICT';
  END IF;


  -- ===================================================
  -- POSTCONDITIONS
  -- ===================================================

  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.id =
    p_combat_state_id;

  IF NOT FOUND
     OR v_combat.status <> 'completed'
     OR v_combat.winner_account_id <>
          v_winner_account_id
     OR v_combat.loser_account_id <>
          v_loser_account_id
     OR v_combat.completion_reason <>
          'hp_depleted'
     OR v_combat.completed_at <>
          v_completed_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TERMINAL_COMBAT_POSTCONDITION_FAILED';
  END IF;


  SELECT t.*
  INTO v_turn
  FROM public.cing_artillery_turn_states AS t
  WHERE t.id =
    p_turn_state_id;

  IF NOT FOUND
     OR v_turn.status <> 'completed'
     OR v_turn.turn_number <>
          p_expected_turn_number
     OR v_turn.active_account_id IS NOT NULL
     OR v_turn.active_session_id IS NOT NULL
     OR v_turn.turn_started_at IS NOT NULL
     OR v_turn.turn_deadline_at IS NOT NULL
     OR v_turn.completed_at <>
          v_completed_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TERMINAL_TURN_POSTCONDITION_FAILED';
  END IF;


  SELECT r.*
  INTO v_runtime
  FROM public.cing_artillery_match_runtimes AS r
  WHERE r.id =
    v_combat.match_runtime_id;

  IF NOT FOUND
     OR v_runtime.status <> 'completed'
     OR v_runtime.winner_account_id <>
          v_winner_account_id
     OR v_runtime.loser_account_id <>
          v_loser_account_id
     OR v_runtime.completion_reason <>
          'hp_depleted'
     OR v_runtime.completed_at <>
          v_completed_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TERMINAL_RUNTIME_POSTCONDITION_FAILED';
  END IF;


  SELECT m.*
  INTO v_match
  FROM public.cing_artillery_matches AS m
  WHERE m.id =
    v_combat.match_id;

  IF NOT FOUND
     OR v_match.status <> 'completed'
     OR v_match.winner_account_id <>
          v_winner_account_id
     OR v_match.loser_account_id <>
          v_loser_account_id
     OR v_match.completion_reason <>
          'hp_depleted'
     OR v_match.completed_at <>
          v_completed_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TERMINAL_MATCH_POSTCONDITION_FAILED';
  END IF;


  RETURN v_combat;
END;
$$;


-- =====================================================
-- PRIVATE FUNCTION ACL
--
-- No application role may invoke this primitive directly.
-- =====================================================

REVOKE ALL
ON FUNCTION
  public.cing_artillery_complete_combat_private(
    uuid,
    uuid,
    integer
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_complete_combat_private(
    uuid,
    uuid,
    integer
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_complete_combat_private(
    uuid,
    uuid,
    integer
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_complete_combat_private(
    uuid,
    uuid,
    integer
  )
FROM service_role;

COMMIT;
