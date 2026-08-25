BEGIN;

-- =====================================================
-- CING PIU PIU
-- UNPLAYED TIMEOUT ABANDONMENT V1
--
-- Root cause:
--
--   expired-turn worker advances every no-shot turn
--   indefinitely because canonical unplayed abandonment
--   exists but is not connected to timeout progression.
--
-- Policy:
--
--   turn 1 timeout + zero accepted shots
--     -> normal turn advance
--
--   turn >= 2 timeout + zero accepted shots in combat
--     -> canonical unplayed abandonment
--
-- This means both participants receive one complete turn
-- opportunity before an entirely unplayed match terminates.
--
-- Existing played matches are unaffected:
-- any accepted shot permanently makes the combat ineligible
-- for this unplayed timeout branch.
--
-- PostgreSQL remains final lifecycle authority.
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


  /*
   * Candidate discovery is intentionally non-mutating.
   *
   * Correctness does not depend on this snapshot.
   * Every candidate is fully revalidated after canonical
   * combat -> turn locking below.
   */
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
        FROM
          public.cing_artillery_shot_commands AS s
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
    /*
     * Canonical lock order:
     *
     *   combat
     *     ->
     *   current turn
     *
     * SKIP LOCKED prevents concurrent workers from waiting
     * on a combat currently owned by another progression
     * or resolution transaction.
     */
    SELECT c.*
    INTO v_combat
    FROM
      public.cing_artillery_combat_states AS c
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
    FROM
      public.cing_artillery_turn_states AS t
    WHERE t.id =
      v_candidate.turn_state_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;


    /*
     * Revalidate the entire timeout fence after locks.
     *
     * This makes stale candidate discovery harmless.
     */
    v_now :=
      clock_timestamp();

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
       OR v_turn.status <>
         'active'
       OR v_turn.turn_number <>
         v_candidate.turn_number
       OR v_turn.turn_number <=
         0
       OR v_turn.active_account_id
         IS NULL
       OR v_turn.active_session_id
         IS NULL
       OR v_turn.turn_started_at
         IS NULL
       OR v_turn.turn_deadline_at
         IS NULL
       OR v_turn.turn_deadline_at >
         v_now
    THEN
      CONTINUE;
    END IF;


    /*
     * Accepted-shot ownership wins over timeout.
     *
     * Shot acceptance locks the same combat/turn authority.
     * Therefore this recheck is race-safe:
     *
     *   accepted shot first
     *     -> timeout skips
     *
     *   timeout locks first
     *     -> turn advances
     *     -> stale shot fails current-turn fencing
     */
    IF EXISTS (
      SELECT 1
      FROM
        public.cing_artillery_shot_commands AS s
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


    /*
     * UNPLAYED LIFECYCLE BOUND.
     *
     * Turn 1 expiry gives player two the first opportunity.
     *
     * If turn 2 (or any later turn) expires while the
     * entire combat still owns zero accepted shot commands,
     * both canonical participants have already received at
     * least one full turn opportunity without playing.
     *
     * Do not advance that lifecycle forever.
     *
     * The combat + turn locks above make the global no-shot
     * observation race-safe against shot acceptance because
     * shot admission acquires the same canonical locks.
     *
     * Mutation itself is delegated to the existing canonical
     * unplayed-abandonment authority.
     */
    IF v_turn.turn_number >= 2
       AND NOT EXISTS (
         SELECT 1
         FROM
           public.cing_artillery_shot_commands AS s
         WHERE s.combat_state_id =
                 v_combat.id
       )
    THEN
      PERFORM
        public.cing_artillery_abandon_unplayed_match_atomic_v1(
          v_combat.match_id
        );

      CONTINUE;
    END IF;


    /*
     * Normal no-shot timeout progression.
     *
     * A single missed turn does not terminate the match.
     * Reuse the single canonical progression primitive.
     */
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


COMMIT;
