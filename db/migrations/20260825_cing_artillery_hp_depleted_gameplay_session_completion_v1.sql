BEGIN;

-- =====================================================
-- CING PIU PIU
-- HP-DEPLETED GAMEPLAY-SESSION COMPLETION V1
--
-- Root cause:
--
--   hp_depleted previously completed:
--
--     turn
--     combat
--     runtime
--     match
--
--   but left both gameplay sessions active.
--
--   Admission then reused those active sessions, while
--   matchmaking recovered their historical matched
--   tickets and returned the already-completed match.
--
-- Canonical fix:
--
--   lethal fenced resolution transaction
--     -> complete turn
--     -> complete combat
--     -> complete runtime
--     -> complete match
--     -> complete both gameplay sessions
--
-- All six lifecycle authorities share one PostgreSQL
-- terminal timestamp.
--
-- Historical matched tickets remain immutable provenance.
-- Subsequent admission creates fresh gameplay sessions,
-- allowing fresh matchmaking without rewriting history.
--
-- No public/client execution authority is introduced.
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

  v_session_one
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_session_two
    public.cing_artillery_gameplay_sessions%ROWTYPE;

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
  -- GAMEPLAY SESSION AUTHORITY
  --
  -- A gameplay session represents one playable
  -- matchmaking/match lifecycle. A completed combat must
  -- therefore release both accounts from these historical
  -- sessions so subsequent admission creates fresh session
  -- identities and fresh matchmaking tickets.
  --
  -- Lock order extends the canonical terminal order:
  --
  --   combat -> turn -> vital -> runtime -> match
  --     -> both gameplay sessions
  --
  -- Both rows are locked in deterministic UUID order.
  -- ===================================================

  PERFORM s.id
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id IN (
    v_match.player_one_session_id,
    v_match.player_two_session_id
  )
  ORDER BY s.id
  FOR UPDATE;


  SELECT s.*
  INTO v_session_one
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
      v_match.player_one_session_id
    AND s.account_id =
      v_match.player_one_account_id;

  IF NOT FOUND
     OR v_session_one.status <>
          'active'
     OR v_session_one.ended_at
          IS NOT NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_ONE_SESSION_NOT_TERMINAL_ELIGIBLE';
  END IF;


  SELECT s.*
  INTO v_session_two
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
      v_match.player_two_session_id
    AND s.account_id =
      v_match.player_two_account_id;

  IF NOT FOUND
     OR v_session_two.status <>
          'active'
     OR v_session_two.ended_at
          IS NOT NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_TWO_SESSION_NOT_TERMINAL_ELIGIBLE';
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
  -- COMPLETE BOTH GAMEPLAY SESSIONS
  --
  -- Use the exact same terminal timestamp as
  -- turn/combat/runtime/match. Historical matched tickets
  -- are intentionally preserved; fresh admission creates
  -- fresh gameplay sessions after this transition.
  -- ===================================================

  UPDATE public.cing_artillery_gameplay_sessions AS s
  SET
    status =
      'completed',

    ended_at =
      v_completed_at,

    updated_at =
      v_completed_at
  WHERE s.id =
      v_session_one.id
    AND s.account_id =
      v_session_one.account_id
    AND s.status =
      'active'
    AND s.ended_at
      IS NULL;

  GET DIAGNOSTICS
    v_updated_count =
      ROW_COUNT;

  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_ONE_SESSION_COMPLETION_CONFLICT';
  END IF;


  UPDATE public.cing_artillery_gameplay_sessions AS s
  SET
    status =
      'completed',

    ended_at =
      v_completed_at,

    updated_at =
      v_completed_at
  WHERE s.id =
      v_session_two.id
    AND s.account_id =
      v_session_two.account_id
    AND s.status =
      'active'
    AND s.ended_at
      IS NULL;

  GET DIAGNOSTICS
    v_updated_count =
      ROW_COUNT;

  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_TWO_SESSION_COMPLETION_CONFLICT';
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


  SELECT s.*
  INTO v_session_one
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
    v_match.player_one_session_id;

  IF NOT FOUND
     OR v_session_one.account_id <>
          v_match.player_one_account_id
     OR v_session_one.status <>
          'completed'
     OR v_session_one.ended_at <>
          v_completed_at
     OR v_session_one.updated_at <>
          v_completed_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_ONE_SESSION_TERMINAL_POSTCONDITION_FAILED';
  END IF;


  SELECT s.*
  INTO v_session_two
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
    v_match.player_two_session_id;

  IF NOT FOUND
     OR v_session_two.account_id <>
          v_match.player_two_account_id
     OR v_session_two.status <>
          'completed'
     OR v_session_two.ended_at <>
          v_completed_at
     OR v_session_two.updated_at <>
          v_completed_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_TWO_SESSION_TERMINAL_POSTCONDITION_FAILED';
  END IF;


  RETURN v_combat;
END;
$$;

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
