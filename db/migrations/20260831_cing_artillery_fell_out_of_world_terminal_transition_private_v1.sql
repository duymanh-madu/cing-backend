BEGIN;

-- =====================================================
-- CING PIU PIU
-- FELL-OUT-OF-WORLD TERMINAL TRANSITION PRIVATE V1
--
-- Purpose:
--
--   authoritative fallen participant
--       ->
--   completed turn
--   completed combat
--   completed runtime
--   completed match
--   completed gameplay sessions
--
-- Winner / loser are NEVER caller supplied.
--
-- Caller supplies only the canonical participant that has
-- already been proven by upstream authoritative world/fall
-- resolution to be outside the legal living world.
--
-- This primitive:
--
--   - does NOT determine whether a player has fallen
--   - does NOT simulate position / terrain / support
--   - does NOT mutate HP
--   - does NOT redefine projectile out_of_bounds
--
-- Combat Vital is still locked and identity-validated to
-- preserve the canonical gameplay lock order:
--
--   combat
--     -> turn
--     -> combat vital
--     -> runtime
--     -> match
--     -> both gameplay sessions
--
-- This function is intentionally PRIVATE.
-- No application role receives EXECUTE.
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.cing_artillery_complete_fell_out_of_world_private(
    p_combat_state_id uuid,
    p_turn_state_id uuid,
    p_expected_turn_number integer,
    p_fallen_account_id uuid
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

  IF p_fallen_account_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_FALLEN_ACCOUNT_ID_REQUIRED';
  END IF;


  -- ===================================================
  -- CANONICAL GAMEPLAY LOCK ORDER
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
  --
  -- HP is deliberately NOT used to decide the terminal
  -- result. The row remains in canonical lock order and
  -- its identity is still validated.
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


  -- ===================================================
  -- FALLEN PARTICIPANT AUTHORITY
  --
  -- Winner is derived exclusively as the other canonical
  -- participant. HP may remain greater than zero.
  -- ===================================================

  IF p_fallen_account_id =
       v_combat.player_one_account_id
  THEN
    v_loser_account_id :=
      v_combat.player_one_account_id;

    v_winner_account_id :=
      v_combat.player_two_account_id;

  ELSIF p_fallen_account_id =
          v_combat.player_two_account_id
  THEN
    v_loser_account_id :=
      v_combat.player_two_account_id;

    v_winner_account_id :=
      v_combat.player_one_account_id;

  ELSE
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_FALLEN_ACCOUNT_NOT_PARTICIPANT';
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
          'CING_ARTILLERY_FALL_TERMINAL_TURN_UPDATE_CONFLICT';
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
      'fell_out_of_world',

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
          'CING_ARTILLERY_FALL_TERMINAL_COMBAT_UPDATE_CONFLICT';
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
      'fell_out_of_world',

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
          'CING_ARTILLERY_FALL_TERMINAL_RUNTIME_UPDATE_CONFLICT';
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
      'fell_out_of_world',

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
          'CING_ARTILLERY_FALL_TERMINAL_MATCH_UPDATE_CONFLICT';
  END IF;


  -- ===================================================
  -- COMPLETE BOTH GAMEPLAY SESSIONS
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
          'CING_ARTILLERY_FALL_PLAYER_ONE_SESSION_COMPLETION_CONFLICT';
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
          'CING_ARTILLERY_FALL_PLAYER_TWO_SESSION_COMPLETION_CONFLICT';
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
          'fell_out_of_world'
     OR v_combat.completed_at <>
          v_completed_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_FALL_TERMINAL_COMBAT_POSTCONDITION_FAILED';
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
          'CING_ARTILLERY_FALL_TERMINAL_TURN_POSTCONDITION_FAILED';
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
          'fell_out_of_world'
     OR v_runtime.completed_at <>
          v_completed_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_FALL_TERMINAL_RUNTIME_POSTCONDITION_FAILED';
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
          'fell_out_of_world'
     OR v_match.completed_at <>
          v_completed_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_FALL_TERMINAL_MATCH_POSTCONDITION_FAILED';
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
          'CING_ARTILLERY_FALL_PLAYER_ONE_SESSION_TERMINAL_POSTCONDITION_FAILED';
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
          'CING_ARTILLERY_FALL_PLAYER_TWO_SESSION_TERMINAL_POSTCONDITION_FAILED';
  END IF;


  RETURN v_combat;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_complete_fell_out_of_world_private(
    uuid,
    uuid,
    integer,
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_complete_fell_out_of_world_private(
    uuid,
    uuid,
    integer,
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_complete_fell_out_of_world_private(
    uuid,
    uuid,
    integer,
    uuid
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_complete_fell_out_of_world_private(
    uuid,
    uuid,
    integer,
    uuid
  )
FROM service_role;


COMMIT;
