BEGIN;

-- =====================================================
-- CING PIU PIU
-- UNPLAYED MATCH ABANDONMENT V1
--
-- Purpose:
--
--   Provide a canonical no-winner terminal lifecycle for
--   an initialized match that has never accepted a shot.
--
-- This authority is deliberately narrower than a future
-- disconnect / surrender / forfeit system.
--
-- It may terminate only an UNPLAYED lifecycle:
--
--   match       matched      -> abandoned
--   runtime     ready        -> abandoned
--   combat      initialized  -> abandoned
--   turn        active       -> abandoned
--   sessions    active       -> abandoned
--
-- Durable semantics:
--
--   winner_account_id = NULL
--   loser_account_id  = NULL
--   completion_reason = 'abandoned'
--
-- Historical matched matchmaking tickets are preserved.
--
-- The same canonical terminal timestamp is written through
-- match/runtime/combat/turn and both gameplay sessions.
--
-- Lock order preserves the existing gameplay terminal order:
--
--   combat
--     -> turn
--     -> vital
--     -> runtime
--     -> match
--     -> player-one session
--     -> player-two session
--
-- No public client role receives EXECUTE.
-- =====================================================


-- =====================================================
-- MATCH STATUS + TERMINAL LIFECYCLE
-- =====================================================

ALTER TABLE public.cing_artillery_matches
  DROP CONSTRAINT
    cing_artillery_matches_status_check;

ALTER TABLE public.cing_artillery_matches
  ADD CONSTRAINT
    cing_artillery_matches_status_check
  CHECK (
    status IN (
      'matched',
      'completed',
      'abandoned'
    )
  );


ALTER TABLE public.cing_artillery_matches
  DROP CONSTRAINT
    cing_artillery_matches_terminal_lifecycle_check;

ALTER TABLE public.cing_artillery_matches
  ADD CONSTRAINT
    cing_artillery_matches_terminal_lifecycle_check
  CHECK (
    (
      status = 'matched'

      AND winner_account_id IS NULL
      AND loser_account_id IS NULL
      AND completion_reason IS NULL
      AND completed_at IS NULL
    )

    OR

    (
      status = 'completed'

      AND winner_account_id IS NOT NULL
      AND loser_account_id IS NOT NULL
      AND winner_account_id <> loser_account_id

      AND completion_reason =
        'hp_depleted'

      AND completed_at IS NOT NULL
      AND completed_at >= matched_at

      AND (
        (
          winner_account_id =
            player_one_account_id
          AND loser_account_id =
            player_two_account_id
        )
        OR
        (
          winner_account_id =
            player_two_account_id
          AND loser_account_id =
            player_one_account_id
        )
      )
    )

    OR

    (
      status = 'abandoned'

      AND winner_account_id IS NULL
      AND loser_account_id IS NULL

      AND completion_reason =
        'abandoned'

      AND completed_at IS NOT NULL
      AND completed_at >= matched_at
    )
  );


-- =====================================================
-- MATCH RUNTIME STATUS + TERMINAL LIFECYCLE
-- =====================================================

ALTER TABLE public.cing_artillery_match_runtimes
  DROP CONSTRAINT
    cing_artillery_match_runtimes_status_check;

ALTER TABLE public.cing_artillery_match_runtimes
  ADD CONSTRAINT
    cing_artillery_match_runtimes_status_check
  CHECK (
    status IN (
      'ready',
      'completed',
      'abandoned'
    )
  );


ALTER TABLE public.cing_artillery_match_runtimes
  DROP CONSTRAINT
    cing_artillery_match_runtimes_terminal_lifecycle_check;

ALTER TABLE public.cing_artillery_match_runtimes
  ADD CONSTRAINT
    cing_artillery_match_runtimes_terminal_lifecycle_check
  CHECK (
    (
      status = 'ready'

      AND winner_account_id IS NULL
      AND loser_account_id IS NULL
      AND completion_reason IS NULL
      AND completed_at IS NULL
    )

    OR

    (
      status = 'completed'

      AND winner_account_id IS NOT NULL
      AND loser_account_id IS NOT NULL
      AND winner_account_id <> loser_account_id

      AND completion_reason =
        'hp_depleted'

      AND completed_at IS NOT NULL
      AND completed_at >= initialized_at

      AND (
        (
          winner_account_id =
            player_one_account_id
          AND loser_account_id =
            player_two_account_id
        )
        OR
        (
          winner_account_id =
            player_two_account_id
          AND loser_account_id =
            player_one_account_id
        )
      )
    )

    OR

    (
      status = 'abandoned'

      AND winner_account_id IS NULL
      AND loser_account_id IS NULL

      AND completion_reason =
        'abandoned'

      AND completed_at IS NOT NULL
      AND completed_at >= initialized_at
    )
  );


-- =====================================================
-- COMBAT STATUS + TERMINAL LIFECYCLE
-- =====================================================

ALTER TABLE public.cing_artillery_combat_states
  DROP CONSTRAINT
    cing_artillery_combat_states_status_check;

ALTER TABLE public.cing_artillery_combat_states
  ADD CONSTRAINT
    cing_artillery_combat_states_status_check
  CHECK (
    status IN (
      'initialized',
      'completed',
      'abandoned'
    )
  );


ALTER TABLE public.cing_artillery_combat_states
  DROP CONSTRAINT
    cing_artillery_combat_states_terminal_lifecycle_check;

ALTER TABLE public.cing_artillery_combat_states
  ADD CONSTRAINT
    cing_artillery_combat_states_terminal_lifecycle_check
  CHECK (
    (
      status = 'initialized'

      AND winner_account_id IS NULL
      AND loser_account_id IS NULL
      AND completion_reason IS NULL
      AND completed_at IS NULL
    )

    OR

    (
      status = 'completed'

      AND winner_account_id IS NOT NULL
      AND loser_account_id IS NOT NULL
      AND winner_account_id <> loser_account_id

      AND completion_reason =
        'hp_depleted'

      AND completed_at IS NOT NULL
      AND completed_at >= initialized_at

      AND (
        (
          winner_account_id =
            player_one_account_id
          AND loser_account_id =
            player_two_account_id
        )
        OR
        (
          winner_account_id =
            player_two_account_id
          AND loser_account_id =
            player_one_account_id
        )
      )
    )

    OR

    (
      status = 'abandoned'

      AND winner_account_id IS NULL
      AND loser_account_id IS NULL

      AND completion_reason =
        'abandoned'

      AND completed_at IS NOT NULL
      AND completed_at >= initialized_at
    )
  );


-- =====================================================
-- TURN STATUS + LIFECYCLE
--
-- Existing initiative-specific constraints remain untouched.
-- Abandonment preserves turn_number + initiative_reason,
-- but clears all live turn ownership/timing.
-- =====================================================

ALTER TABLE public.cing_artillery_turn_states
  DROP CONSTRAINT
    cing_artillery_turn_states_status_check;

ALTER TABLE public.cing_artillery_turn_states
  ADD CONSTRAINT
    cing_artillery_turn_states_status_check
  CHECK (
    status IN (
      'pending',
      'active',
      'completed',
      'abandoned'
    )
  );


ALTER TABLE public.cing_artillery_turn_states
  DROP CONSTRAINT
    cing_artillery_turn_states_lifecycle_check;

ALTER TABLE public.cing_artillery_turn_states
  ADD CONSTRAINT
    cing_artillery_turn_states_lifecycle_check
  CHECK (
    (
      status = 'pending'

      AND turn_number = 0

      AND active_account_id IS NULL
      AND active_session_id IS NULL

      AND turn_started_at IS NULL
      AND turn_deadline_at IS NULL

      AND completed_at IS NULL
    )

    OR

    (
      status = 'active'

      AND turn_number > 0

      AND active_account_id IS NOT NULL
      AND active_session_id IS NOT NULL

      AND turn_started_at IS NOT NULL
      AND turn_deadline_at IS NOT NULL
      AND turn_deadline_at >
        turn_started_at

      AND completed_at IS NULL
    )

    OR

    (
      status = 'completed'

      AND turn_number > 0

      AND active_account_id IS NULL
      AND active_session_id IS NULL

      AND turn_started_at IS NULL
      AND turn_deadline_at IS NULL

      AND completed_at IS NOT NULL
    )

    OR

    (
      status = 'abandoned'

      AND turn_number > 0

      AND active_account_id IS NULL
      AND active_session_id IS NULL

      AND turn_started_at IS NULL
      AND turn_deadline_at IS NULL

      AND completed_at IS NOT NULL
    )
  );


-- =====================================================
-- CANONICAL UNPLAYED ABANDONMENT AUTHORITY
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_abandon_unplayed_match_atomic_v1(
    p_match_id uuid
  )
RETURNS public.cing_artillery_matches
LANGUAGE plpgsql
SECURITY DEFINER
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

  v_max_hp numeric;

  v_terminal_at timestamptz;

  v_updated_count integer;
BEGIN
  IF p_match_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_MATCH_ID_REQUIRED';
  END IF;


  -- ===================================================
  -- LOCK: COMBAT
  -- ===================================================

  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.match_id =
    p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_FOUND';
  END IF;


  -- ===================================================
  -- LOCK: TURN
  -- ===================================================

  SELECT t.*
  INTO v_turn
  FROM public.cing_artillery_turn_states AS t
  WHERE t.combat_state_id =
    v_combat.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_TURN_STATE_NOT_FOUND';
  END IF;


  -- ===================================================
  -- LOCK: VITAL
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


  -- ===================================================
  -- LOCK: RUNTIME
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


  -- ===================================================
  -- LOCK: MATCH
  -- ===================================================

  SELECT m.*
  INTO v_match
  FROM public.cing_artillery_matches AS m
  WHERE m.id =
    p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_MATCH_NOT_FOUND';
  END IF;


  -- ===================================================
  -- IDENTITY FENCE
  -- ===================================================

  IF v_combat.match_id <>
       v_match.id
     OR v_runtime.match_id <>
       v_match.id
     OR v_turn.match_id <>
       v_match.id

     OR v_combat.match_runtime_id <>
       v_runtime.id
     OR v_turn.match_runtime_id <>
       v_runtime.id
     OR v_turn.combat_state_id <>
       v_combat.id

     OR v_runtime.player_one_account_id <>
       v_match.player_one_account_id
     OR v_runtime.player_one_session_id <>
       v_match.player_one_session_id
     OR v_runtime.player_two_account_id <>
       v_match.player_two_account_id
     OR v_runtime.player_two_session_id <>
       v_match.player_two_session_id

     OR v_combat.player_one_account_id <>
       v_match.player_one_account_id
     OR v_combat.player_one_session_id <>
       v_match.player_one_session_id
     OR v_combat.player_two_account_id <>
       v_match.player_two_account_id
     OR v_combat.player_two_session_id <>
       v_match.player_two_session_id

     OR v_turn.player_one_account_id <>
       v_match.player_one_account_id
     OR v_turn.player_one_session_id <>
       v_match.player_one_session_id
     OR v_turn.player_two_account_id <>
       v_match.player_two_account_id
     OR v_turn.player_two_session_id <>
       v_match.player_two_session_id

     OR v_vital.match_id <>
       v_match.id
     OR v_vital.match_runtime_id <>
       v_runtime.id
     OR v_vital.combat_state_id <>
       v_combat.id
     OR v_vital.player_one_account_id <>
       v_match.player_one_account_id
     OR v_vital.player_two_account_id <>
       v_match.player_two_account_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_ABANDON_STATE_INCONSISTENT';
  END IF;


  -- ===================================================
  -- LOCK BOTH GAMEPLAY SESSIONS
  -- ===================================================

  SELECT s.*
  INTO v_session_one
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
      v_match.player_one_session_id
    AND s.account_id =
      v_match.player_one_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_ONE_SESSION_NOT_FOUND';
  END IF;


  SELECT s.*
  INTO v_session_two
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
      v_match.player_two_session_id
    AND s.account_id =
      v_match.player_two_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_TWO_SESSION_NOT_FOUND';
  END IF;


  -- ===================================================
  -- IDEMPOTENT EXACT RETRY
  -- ===================================================

  IF v_match.status =
       'abandoned'
  THEN
    IF v_runtime.status <>
         'abandoned'
       OR v_combat.status <>
         'abandoned'
       OR v_turn.status <>
         'abandoned'

       OR v_match.winner_account_id
            IS NOT NULL
       OR v_match.loser_account_id
            IS NOT NULL
       OR v_match.completion_reason <>
            'abandoned'
       OR v_match.completed_at
            IS NULL

       OR v_runtime.winner_account_id
            IS NOT NULL
       OR v_runtime.loser_account_id
            IS NOT NULL
       OR v_runtime.completion_reason <>
            'abandoned'
       OR v_runtime.completed_at <>
            v_match.completed_at

       OR v_combat.winner_account_id
            IS NOT NULL
       OR v_combat.loser_account_id
            IS NOT NULL
       OR v_combat.completion_reason <>
            'abandoned'
       OR v_combat.completed_at <>
            v_match.completed_at

       OR v_turn.completed_at <>
            v_match.completed_at
       OR v_turn.active_account_id
            IS NOT NULL
       OR v_turn.active_session_id
            IS NOT NULL
       OR v_turn.turn_started_at
            IS NOT NULL
       OR v_turn.turn_deadline_at
            IS NOT NULL

       OR v_session_one.status <>
            'abandoned'
       OR v_session_two.status <>
            'abandoned'
       OR v_session_one.ended_at <>
            v_match.completed_at
       OR v_session_two.ended_at <>
            v_match.completed_at
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_ABANDON_RETRY_INCONSISTENT';
    END IF;

    RETURN
      v_match;
  END IF;


  -- ===================================================
  -- FIRST-TRANSITION STATE FENCE
  -- ===================================================

  IF v_match.status <>
       'matched'
     OR v_runtime.status <>
       'ready'
     OR v_combat.status <>
       'initialized'
     OR v_turn.status <>
       'active'
     OR v_session_one.status <>
       'active'
     OR v_session_two.status <>
       'active'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_MATCH_NOT_ABANDON_ELIGIBLE';
  END IF;


  IF v_match.winner_account_id
       IS NOT NULL
     OR v_match.loser_account_id
       IS NOT NULL
     OR v_match.completion_reason
       IS NOT NULL
     OR v_match.completed_at
       IS NOT NULL

     OR v_runtime.winner_account_id
       IS NOT NULL
     OR v_runtime.loser_account_id
       IS NOT NULL
     OR v_runtime.completion_reason
       IS NOT NULL
     OR v_runtime.completed_at
       IS NOT NULL

     OR v_combat.winner_account_id
       IS NOT NULL
     OR v_combat.loser_account_id
       IS NOT NULL
     OR v_combat.completion_reason
       IS NOT NULL
     OR v_combat.completed_at
       IS NOT NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_MATCH_TERMINAL_STATE_CONFLICT';
  END IF;


  IF v_turn.turn_number <= 0
     OR v_turn.active_account_id
          IS NULL
     OR v_turn.active_session_id
          IS NULL
     OR v_turn.turn_started_at
          IS NULL
     OR v_turn.turn_deadline_at
          IS NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TURN_STATE_CONFLICT';
  END IF;


  -- ===================================================
  -- UNPLAYED FENCE
  --
  -- This V1 is not a surrender/forfeit authority.
  -- Any accepted/executed/resolved shot makes the match
  -- ineligible for this transition.
  -- ===================================================

  IF EXISTS (
    SELECT 1
    FROM public.cing_artillery_shot_commands AS s
    WHERE s.match_id =
      v_match.id
  )
  OR EXISTS (
    SELECT 1
    FROM public.cing_artillery_shot_executions AS e
    WHERE e.match_id =
      v_match.id
  )
  OR EXISTS (
    SELECT 1
    FROM public.cing_artillery_shot_resolutions AS r
    WHERE r.match_id =
      v_match.id
  )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_MATCH_ALREADY_PLAYED';
  END IF;


  v_max_hp :=
    NULLIF(
      v_combat.rules_snapshot
        ->> 'max_hp',
      ''
    )::numeric;


  IF v_max_hp IS NULL
     OR v_max_hp <= 0
     OR v_vital.player_one_current_hp <>
          v_max_hp
     OR v_vital.player_two_current_hp <>
          v_max_hp
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_UNPLAYED_HP_STATE_INVALID';
  END IF;


  -- ===================================================
  -- SINGLE TERMINAL TIMESTAMP
  -- ===================================================

  v_terminal_at :=
    clock_timestamp();


  -- ===================================================
  -- TURN -> ABANDONED
  --
  -- Clearing ownership/deadline immediately removes this
  -- turn from expired-turn worker eligibility.
  -- ===================================================

  UPDATE public.cing_artillery_turn_states AS t
  SET
    status =
      'abandoned',

    active_account_id =
      NULL,

    active_session_id =
      NULL,

    turn_started_at =
      NULL,

    turn_deadline_at =
      NULL,

    completed_at =
      v_terminal_at,

    updated_at =
      v_terminal_at
  WHERE t.id =
      v_turn.id
    AND t.combat_state_id =
      v_combat.id
    AND t.status =
      'active'
    AND t.turn_number =
      v_turn.turn_number;

  GET DIAGNOSTICS
    v_updated_count =
      ROW_COUNT;

  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_ABANDON_TURN_UPDATE_CONFLICT';
  END IF;


  -- ===================================================
  -- COMBAT -> ABANDONED
  -- ===================================================

  UPDATE public.cing_artillery_combat_states AS c
  SET
    status =
      'abandoned',

    winner_account_id =
      NULL,

    loser_account_id =
      NULL,

    completion_reason =
      'abandoned',

    completed_at =
      v_terminal_at,

    updated_at =
      v_terminal_at
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
          'CING_ARTILLERY_ABANDON_COMBAT_UPDATE_CONFLICT';
  END IF;


  -- ===================================================
  -- RUNTIME -> ABANDONED
  -- ===================================================

  UPDATE public.cing_artillery_match_runtimes AS r
  SET
    status =
      'abandoned',

    winner_account_id =
      NULL,

    loser_account_id =
      NULL,

    completion_reason =
      'abandoned',

    completed_at =
      v_terminal_at,

    updated_at =
      v_terminal_at
  WHERE r.id =
      v_runtime.id
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
          'CING_ARTILLERY_ABANDON_RUNTIME_UPDATE_CONFLICT';
  END IF;


  -- ===================================================
  -- MATCH -> ABANDONED
  -- ===================================================

  UPDATE public.cing_artillery_matches AS m
  SET
    status =
      'abandoned',

    winner_account_id =
      NULL,

    loser_account_id =
      NULL,

    completion_reason =
      'abandoned',

    completed_at =
      v_terminal_at,

    updated_at =
      v_terminal_at
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
          'CING_ARTILLERY_ABANDON_MATCH_UPDATE_CONFLICT';
  END IF;


  -- ===================================================
  -- BOTH GAMEPLAY SESSIONS -> ABANDONED
  -- ===================================================

  UPDATE public.cing_artillery_gameplay_sessions AS s
  SET
    status =
      'abandoned',

    ended_at =
      v_terminal_at,

    updated_at =
      v_terminal_at
  WHERE s.id IN (
      v_match.player_one_session_id,
      v_match.player_two_session_id
    )
    AND s.status =
      'active';

  GET DIAGNOSTICS
    v_updated_count =
      ROW_COUNT;

  IF v_updated_count <> 2 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_ABANDON_SESSION_UPDATE_CONFLICT';
  END IF;


  -- ===================================================
  -- POSTCONDITIONS
  -- ===================================================

  SELECT m.*
  INTO v_match
  FROM public.cing_artillery_matches AS m
  WHERE m.id =
    p_match_id;

  SELECT r.*
  INTO v_runtime
  FROM public.cing_artillery_match_runtimes AS r
  WHERE r.id =
    v_combat.match_runtime_id;

  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.id =
    v_combat.id;

  SELECT t.*
  INTO v_turn
  FROM public.cing_artillery_turn_states AS t
  WHERE t.id =
    v_turn.id;

  SELECT s.*
  INTO v_session_one
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
    v_match.player_one_session_id;

  SELECT s.*
  INTO v_session_two
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
    v_match.player_two_session_id;


  IF v_match.status <>
       'abandoned'
     OR v_match.winner_account_id
          IS NOT NULL
     OR v_match.loser_account_id
          IS NOT NULL
     OR v_match.completion_reason <>
          'abandoned'
     OR v_match.completed_at <>
          v_terminal_at

     OR v_runtime.status <>
          'abandoned'
     OR v_runtime.winner_account_id
          IS NOT NULL
     OR v_runtime.loser_account_id
          IS NOT NULL
     OR v_runtime.completion_reason <>
          'abandoned'
     OR v_runtime.completed_at <>
          v_terminal_at

     OR v_combat.status <>
          'abandoned'
     OR v_combat.winner_account_id
          IS NOT NULL
     OR v_combat.loser_account_id
          IS NOT NULL
     OR v_combat.completion_reason <>
          'abandoned'
     OR v_combat.completed_at <>
          v_terminal_at

     OR v_turn.status <>
          'abandoned'
     OR v_turn.active_account_id
          IS NOT NULL
     OR v_turn.active_session_id
          IS NOT NULL
     OR v_turn.turn_started_at
          IS NOT NULL
     OR v_turn.turn_deadline_at
          IS NOT NULL
     OR v_turn.completed_at <>
          v_terminal_at

     OR v_session_one.status <>
          'abandoned'
     OR v_session_two.status <>
          'abandoned'
     OR v_session_one.ended_at <>
          v_terminal_at
     OR v_session_two.ended_at <>
          v_terminal_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_ABANDON_POSTCONDITION_FAILED';
  END IF;


  RETURN
    v_match;
END;
$$;


-- =====================================================
-- RPC ACL
-- =====================================================

REVOKE ALL ON FUNCTION
  public.cing_artillery_abandon_unplayed_match_atomic_v1(
    uuid
  )
FROM PUBLIC;

REVOKE ALL ON FUNCTION
  public.cing_artillery_abandon_unplayed_match_atomic_v1(
    uuid
  )
FROM anon;

REVOKE ALL ON FUNCTION
  public.cing_artillery_abandon_unplayed_match_atomic_v1(
    uuid
  )
FROM authenticated;

REVOKE ALL ON FUNCTION
  public.cing_artillery_abandon_unplayed_match_atomic_v1(
    uuid
  )
FROM service_role;

GRANT EXECUTE ON FUNCTION
  public.cing_artillery_abandon_unplayed_match_atomic_v1(
    uuid
  )
TO service_role;


COMMIT;
