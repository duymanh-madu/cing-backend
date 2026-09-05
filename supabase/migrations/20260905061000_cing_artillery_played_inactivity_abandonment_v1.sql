BEGIN;

-- =====================================================
-- CING ARTILLERY
-- PLAYED INACTIVITY ABANDONMENT V1
--
-- Existing unplayed abandonment remains unchanged.
--
-- Played lifecycle:
--
--   last accepted shot = turn N
--   turn N+1 expires without shot
--     -> advance normally
--   turn N+2 expires without shot
--     -> both participants have received one complete
--        post-shot opportunity without playing
--     -> abandon match
--
-- This prevents an initialized combat from advancing
-- forever after gameplay has stopped.
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.cing_artillery_abandon_inactive_played_match_private_v1(
    p_match_id uuid,
    p_expected_turn_number integer
  )
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_turn
    public.cing_artillery_turn_states%ROWTYPE;

  v_runtime
    public.cing_artillery_match_runtimes%ROWTYPE;

  v_match
    public.cing_artillery_matches%ROWTYPE;

  v_session_one
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_session_two
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_last_shot_turn integer;
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

  IF p_expected_turn_number IS NULL
     OR p_expected_turn_number <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_TURN_NUMBER_INVALID';
  END IF;


  -- ---------------------------------------------------
  -- Canonical gameplay lock order begins:
  -- combat -> turn
  -- ---------------------------------------------------

  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.match_id =
    p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_combat.status <>
       'initialized'
  THEN
    RETURN false;
  END IF;


  SELECT t.*
  INTO v_turn
  FROM public.cing_artillery_turn_states AS t
  WHERE t.combat_state_id =
    v_combat.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;


  -- Exact-current expired-turn fence.
  IF v_turn.status <>
       'active'
     OR v_turn.turn_number <>
       p_expected_turn_number
     OR v_turn.active_account_id IS NULL
     OR v_turn.active_session_id IS NULL
     OR v_turn.turn_started_at IS NULL
     OR v_turn.turn_deadline_at IS NULL
     OR v_turn.turn_deadline_at >
       clock_timestamp()
  THEN
    RETURN false;
  END IF;


  -- ---------------------------------------------------
  -- Determine most recent accepted gameplay turn.
  -- ---------------------------------------------------

  SELECT max(s.turn_number)
  INTO v_last_shot_turn
  FROM public.cing_artillery_shot_commands AS s
  WHERE s.combat_state_id =
    v_combat.id
    AND s.match_id =
      v_combat.match_id;


  -- This authority is only for played matches.
  IF v_last_shot_turn IS NULL THEN
    RETURN false;
  END IF;


  -- Current turn itself must own no accepted shot.
  IF EXISTS (
    SELECT 1
    FROM public.cing_artillery_shot_commands AS s
    WHERE s.combat_state_id =
      v_combat.id
      AND s.turn_state_id =
        v_turn.id
      AND s.turn_number =
        v_turn.turn_number
  )
  THEN
    RETURN false;
  END IF;


  -- Both players must have received a complete
  -- no-shot opportunity after the last played turn.
  IF v_turn.turn_number::bigint <
       v_last_shot_turn::bigint + 2
  THEN
    RETURN false;
  END IF;


  -- ---------------------------------------------------
  -- Lock remaining terminal lifecycle authority.
  -- ---------------------------------------------------

  SELECT r.*
  INTO v_runtime
  FROM public.cing_artillery_match_runtimes AS r
  WHERE r.id =
    v_combat.match_runtime_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;


  SELECT m.*
  INTO v_match
  FROM public.cing_artillery_matches AS m
  WHERE m.id =
    v_combat.match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;


  IF v_runtime.match_id <>
       v_match.id
     OR v_combat.match_id <>
       v_match.id
     OR v_turn.match_id <>
       v_match.id
     OR v_runtime.id <>
       v_combat.match_runtime_id
     OR v_turn.match_runtime_id <>
       v_runtime.id
     OR v_turn.combat_state_id <>
       v_combat.id
     OR v_match.status <>
       'matched'
     OR v_runtime.status <>
       'ready'
     OR v_combat.status <>
       'initialized'
     OR v_turn.status <>
       'active'
  THEN
    RETURN false;
  END IF;


  IF v_match.winner_account_id IS NOT NULL
     OR v_match.loser_account_id IS NOT NULL
     OR v_match.completion_reason IS NOT NULL
     OR v_match.completed_at IS NOT NULL
     OR v_runtime.winner_account_id IS NOT NULL
     OR v_runtime.loser_account_id IS NOT NULL
     OR v_runtime.completion_reason IS NOT NULL
     OR v_runtime.completed_at IS NOT NULL
     OR v_combat.winner_account_id IS NOT NULL
     OR v_combat.loser_account_id IS NOT NULL
     OR v_combat.completion_reason IS NOT NULL
     OR v_combat.completed_at IS NOT NULL
  THEN
    RETURN false;
  END IF;


  SELECT s.*
  INTO v_session_one
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
      v_match.player_one_session_id
    AND s.account_id =
      v_match.player_one_account_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_session_one.status <>
          'active'
  THEN
    RETURN false;
  END IF;


  SELECT s.*
  INTO v_session_two
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
      v_match.player_two_session_id
    AND s.account_id =
      v_match.player_two_account_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_session_two.status <>
          'active'
  THEN
    RETURN false;
  END IF;


  v_terminal_at :=
    clock_timestamp();


  -- ---------------------------------------------------
  -- TURN -> abandoned
  -- ---------------------------------------------------

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
    AND t.turn_number =
      p_expected_turn_number
    AND t.status =
      'active';

  GET DIAGNOSTICS
    v_updated_count =
      ROW_COUNT;

  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_INACTIVITY_ABANDON_TURN_CONFLICT';
  END IF;


  -- ---------------------------------------------------
  -- COMBAT -> abandoned
  -- ---------------------------------------------------

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
          'CING_ARTILLERY_INACTIVITY_ABANDON_COMBAT_CONFLICT';
  END IF;


  -- ---------------------------------------------------
  -- RUNTIME -> abandoned
  -- ---------------------------------------------------

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
          'CING_ARTILLERY_INACTIVITY_ABANDON_RUNTIME_CONFLICT';
  END IF;


  -- ---------------------------------------------------
  -- MATCH -> abandoned
  -- ---------------------------------------------------

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
          'CING_ARTILLERY_INACTIVITY_ABANDON_MATCH_CONFLICT';
  END IF;


  -- ---------------------------------------------------
  -- BOTH GAMEPLAY SESSIONS -> abandoned
  -- ---------------------------------------------------

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
          'CING_ARTILLERY_INACTIVITY_ABANDON_SESSION_CONFLICT';
  END IF;


  RETURN true;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_abandon_inactive_played_match_private_v1(
    uuid,
    integer
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_abandon_inactive_played_match_private_v1(
    uuid,
    integer
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_abandon_inactive_played_match_private_v1(
    uuid,
    integer
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_abandon_inactive_played_match_private_v1(
    uuid,
    integer
  )
FROM service_role;


-- =====================================================
-- Replace expired-turn progression authority.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_advance_expired_turns_atomic(
    p_limit integer
  )
RETURNS SETOF
  public.cing_artillery_turn_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_candidate record;

  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_turn
    public.cing_artillery_turn_states%ROWTYPE;

  v_advanced
    public.cing_artillery_turn_states%ROWTYPE;

  v_last_shot_turn integer;
  v_now timestamptz;
BEGIN
  IF p_limit IS NULL
     OR p_limit <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_EXPIRED_TURN_LIMIT_INVALID';
  END IF;


  FOR v_candidate IN
    SELECT
      t.combat_state_id,
      t.id AS turn_state_id,
      t.turn_number,
      t.turn_deadline_at
    FROM public.cing_artillery_turn_states AS t
    INNER JOIN
      public.cing_artillery_combat_states AS c
        ON c.id =
          t.combat_state_id
    WHERE t.status =
            'active'
      AND t.turn_number >
            0
      AND t.active_account_id
            IS NOT NULL
      AND t.active_session_id
            IS NOT NULL
      AND t.turn_started_at
            IS NOT NULL
      AND t.turn_deadline_at
            IS NOT NULL
      AND t.turn_deadline_at <=
            clock_timestamp()
      AND c.status =
            'initialized'
      AND NOT EXISTS (
        SELECT 1
        FROM public.cing_artillery_shot_commands AS s
        WHERE s.turn_state_id =
                t.id
          AND s.combat_state_id =
                t.combat_state_id
          AND s.turn_number =
                t.turn_number
      )
    ORDER BY
      t.turn_deadline_at ASC,
      t.id ASC
    LIMIT p_limit
  LOOP

    SELECT c.*
    INTO v_combat
    FROM public.cing_artillery_combat_states AS c
    WHERE c.id =
      v_candidate.combat_state_id
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;


    IF v_combat.status <>
         'initialized'
    THEN
      CONTINUE;
    END IF;


    SELECT t.*
    INTO v_turn
    FROM public.cing_artillery_turn_states AS t
    WHERE t.id =
      v_candidate.turn_state_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;


    v_now :=
      clock_timestamp();


    IF v_turn.combat_state_id <>
         v_combat.id
       OR v_turn.match_runtime_id <>
         v_combat.match_runtime_id
       OR v_turn.match_id <>
         v_combat.match_id
       OR v_turn.status <>
         'active'
       OR v_turn.turn_number <>
         v_candidate.turn_number
       OR v_turn.active_account_id IS NULL
       OR v_turn.active_session_id IS NULL
       OR v_turn.turn_started_at IS NULL
       OR v_turn.turn_deadline_at IS NULL
       OR v_turn.turn_deadline_at >
         v_now
    THEN
      CONTINUE;
    END IF;


    -- Accepted shot always owns its turn.
    IF EXISTS (
      SELECT 1
      FROM public.cing_artillery_shot_commands AS s
      WHERE s.turn_state_id =
              v_turn.id
        AND s.combat_state_id =
              v_combat.id
        AND s.turn_number =
              v_turn.turn_number
    )
    THEN
      CONTINUE;
    END IF;


    SELECT max(s.turn_number)
    INTO v_last_shot_turn
    FROM public.cing_artillery_shot_commands AS s
    WHERE s.combat_state_id =
      v_combat.id;


    -- -----------------------------------------------
    -- Entirely unplayed combat.
    -- Preserve existing two-opportunity rule.
    -- -----------------------------------------------

    IF v_last_shot_turn IS NULL
       AND v_turn.turn_number >= 2
    THEN
      PERFORM
        public.cing_artillery_abandon_unplayed_match_atomic_v1(
          v_combat.match_id
        );

      CONTINUE;
    END IF;


    -- -----------------------------------------------
    -- Played combat inactivity.
    --
    -- Last shot N:
    -- N+1 timeout => one player missed, advance.
    -- N+2 timeout => both players missed, abandon.
    -- -----------------------------------------------

    IF v_last_shot_turn IS NOT NULL
       AND v_turn.turn_number::bigint >=
             v_last_shot_turn::bigint + 2
    THEN
      PERFORM
        public.cing_artillery_abandon_inactive_played_match_private_v1(
          v_combat.match_id,
          v_turn.turn_number
        );

      CONTINUE;
    END IF;


    -- Normal one-turn timeout progression.
    v_advanced :=
      public.cing_artillery_advance_turn_private(
        v_combat.id,
        v_turn.id,
        v_turn.turn_number
      );


    IF v_advanced.id IS NULL
       OR v_advanced.id <>
            v_turn.id
       OR v_advanced.combat_state_id <>
            v_combat.id
       OR v_advanced.turn_number <>
            v_turn.turn_number + 1
       OR v_advanced.status <>
            'active'
       OR v_advanced.active_account_id IS NULL
       OR v_advanced.active_session_id IS NULL
       OR v_advanced.turn_started_at IS NULL
       OR v_advanced.turn_deadline_at IS NULL
       OR v_advanced.turn_deadline_at <=
            v_advanced.turn_started_at
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_EXPIRED_TURN_ADVANCEMENT_INCONSISTENT';
    END IF;


    RETURN NEXT
      v_advanced;
  END LOOP;


  RETURN;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_advance_expired_turns_atomic(
    integer
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_advance_expired_turns_atomic(
    integer
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_advance_expired_turns_atomic(
    integer
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_advance_expired_turns_atomic(
    integer
  )
FROM service_role;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_advance_expired_turns_atomic(
    integer
  )
TO service_role;


-- =====================================================
-- Generic repair of existing runaway played combats.
--
-- No match/execution/user IDs are embedded.
-- Only an already-expired active turn that is >= two
-- turns after its combat's last accepted shot qualifies.
-- =====================================================

DO $$
DECLARE
  v_candidate record;
BEGIN
  FOR v_candidate IN
    SELECT
      c.match_id,
      t.turn_number
    FROM public.cing_artillery_combat_states AS c
    INNER JOIN
      public.cing_artillery_turn_states AS t
        ON t.combat_state_id =
          c.id
    CROSS JOIN LATERAL (
      SELECT
        max(s.turn_number) AS last_shot_turn
      FROM public.cing_artillery_shot_commands AS s
      WHERE s.combat_state_id =
        c.id
    ) AS shot
    WHERE c.status =
            'initialized'
      AND t.status =
            'active'
      AND t.turn_deadline_at
            IS NOT NULL
      AND t.turn_deadline_at <=
            clock_timestamp()
      AND shot.last_shot_turn
            IS NOT NULL
      AND t.turn_number::bigint >=
            shot.last_shot_turn::bigint + 2
      AND NOT EXISTS (
        SELECT 1
        FROM public.cing_artillery_shot_commands AS current_shot
        WHERE current_shot.combat_state_id =
                c.id
          AND current_shot.turn_state_id =
                t.id
          AND current_shot.turn_number =
                t.turn_number
      )
    ORDER BY
      t.turn_deadline_at ASC,
      t.id ASC
  LOOP
    PERFORM
      public.cing_artillery_abandon_inactive_played_match_private_v1(
        v_candidate.match_id,
        v_candidate.turn_number
      );
  END LOOP;
END;
$$;


COMMIT;
