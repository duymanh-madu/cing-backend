BEGIN;

-- =====================================================
-- CING ARTILLERY — PRIVATE TURN ADVANCEMENT AUTHORITY
--
-- Purpose:
--
--   canonical ACTIVE turn N
--        ->
--   canonical ACTIVE turn N + 1
--
-- The same cing_artillery_turn_states row remains the
-- mutable CURRENT-TURN singleton for the combat.
--
-- This authority:
--
--   validates exact combat + turn identity
--   locks combat before turn
--   increments turn_number exactly once
--   switches active participant to the opponent
--   derives the opponent session from combat authority
--   creates a new PostgreSQL-owned turn timer
--   preserves initiative_reason unchanged
--
-- This authority intentionally does NOT:
--
--   persist shot resolution
--   inspect projectile outcome
--   apply damage
--   mutate Combat Vital HP
--   complete shot execution
--   complete combat
--   complete match
--   choose a winner
--   emit realtime events
--
-- IMPORTANT:
--
-- This function is a PRIVATE PostgreSQL transition
-- primitive. service_role receives NO EXECUTE privilege.
--
-- A later fenced resolution-commit SECURITY DEFINER RPC
-- will call this primitive inside the SAME PostgreSQL
-- transaction as:
--
--   resolution persistence
--   HP mutation
--   execution completion
--
-- when the target remains alive.
--
-- Deadline semantics:
--
-- A shot is required to be ACCEPTED before the current
-- turn deadline by Shot Command authority.
--
-- An already accepted shot may resolve after that deadline.
-- Therefore advancement does NOT reject an otherwise
-- canonical turn merely because its old deadline has
-- elapsed while execution was processing.
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.cing_artillery_advance_turn_private(
    p_combat_state_id uuid,
    p_turn_state_id uuid,
    p_expected_turn_number integer
  )
RETURNS public.cing_artillery_turn_states
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_turn
    public.cing_artillery_turn_states%ROWTYPE;

  v_next_account_id uuid;
  v_next_session_id uuid;

  v_turn_duration_ms numeric;

  v_started_at timestamptz;
  v_deadline_at timestamptz;

  v_next_turn_number integer;

  v_original_initiative_reason text;
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
  -- CANONICAL LOCK ORDER
  --
  --   combat
  --     ->
  --   current turn
  --
  -- Future atomic gameplay authorities must preserve
  -- this ordering.
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
  -- COMBAT / TURN IDENTITY
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
          'CING_ARTILLERY_TURN_STATE_INCONSISTENT';
  END IF;


  -- ===================================================
  -- EXACT CURRENT TURN FENCING
  --
  -- This primitive is intentionally NOT idempotent for
  -- an already advanced turn.
  --
  -- A stale caller for N must fail after N -> N+1.
  --
  -- The later outer fenced Resolution Commit owns retry
  -- idempotency and must detect already-durable resolution
  -- before invoking this transition.
  -- ===================================================

  IF v_turn.status <>
       'active'
     OR v_turn.turn_number <>
       p_expected_turn_number
     OR v_turn.active_account_id IS NULL
     OR v_turn.active_session_id IS NULL
     OR v_turn.turn_started_at IS NULL
     OR v_turn.turn_deadline_at IS NULL
     OR v_turn.turn_deadline_at <=
        v_turn.turn_started_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TURN_ADVANCEMENT_STATE_INVALID';
  END IF;


  -- ===================================================
  -- CURRENT PARTICIPANT -> OPPONENT
  --
  -- Caller cannot choose next player.
  -- ===================================================

  IF v_turn.active_account_id =
       v_combat.player_one_account_id
     AND v_turn.active_session_id =
       v_combat.player_one_session_id
  THEN
    v_next_account_id :=
      v_combat.player_two_account_id;

    v_next_session_id :=
      v_combat.player_two_session_id;

  ELSIF v_turn.active_account_id =
          v_combat.player_two_account_id
        AND v_turn.active_session_id =
          v_combat.player_two_session_id
  THEN
    v_next_account_id :=
      v_combat.player_one_account_id;

    v_next_session_id :=
      v_combat.player_one_session_id;

  ELSE
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TURN_ACTIVE_PARTICIPANT_INVALID';
  END IF;

  IF v_next_account_id IS NULL
     OR v_next_session_id IS NULL
     OR v_next_account_id =
        v_turn.active_account_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TURN_NEXT_PARTICIPANT_INVALID';
  END IF;


  -- ===================================================
  -- TURN NUMBER OVERFLOW GUARD
  -- ===================================================

  IF v_turn.turn_number >=
       2147483647
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22003',
        MESSAGE =
          'CING_ARTILLERY_TURN_NUMBER_OVERFLOW';
  END IF;

  v_next_turn_number :=
    v_turn.turn_number + 1;

  IF v_next_turn_number <=
       v_turn.turn_number
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22003',
        MESSAGE =
          'CING_ARTILLERY_TURN_NUMBER_OVERFLOW';
  END IF;


  -- ===================================================
  -- IMMUTABLE TIMER AUTHORITY
  --
  -- Never consult live app config here.
  -- Existing combat rules_snapshot owns this combat.
  -- ===================================================

  IF v_combat.rules_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.rules_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.rules_snapshot ->
            'turn_duration_ms'
        ) <> 'number'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TURN_ADVANCEMENT_RULES_INVALID';
  END IF;

  BEGIN
    v_turn_duration_ms :=
      (
        v_combat.rules_snapshot ->>
          'turn_duration_ms'
      )::numeric;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_TURN_ADVANCEMENT_RULES_INVALID';
  END;

  IF v_turn_duration_ms IS NULL
     OR v_turn_duration_ms =
        'NaN'::numeric
     OR v_turn_duration_ms =
        'Infinity'::numeric
     OR v_turn_duration_ms =
        '-Infinity'::numeric
     OR v_turn_duration_ms <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TURN_ADVANCEMENT_RULES_INVALID';
  END IF;


  -- ===================================================
  -- INITIATIVE METADATA MUST NEVER BE REROLLED
  -- ===================================================

  IF v_turn.initiative_reason NOT IN (
       'speed',
       'speed_tiebreak'
     )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TURN_INITIATIVE_REASON_INVALID';
  END IF;

  v_original_initiative_reason :=
    v_turn.initiative_reason;


  -- ===================================================
  -- NEW POSTGRESQL-OWNED TIMER
  -- ===================================================

  v_started_at :=
    clock_timestamp();

  v_deadline_at :=
    v_started_at +
    (
      v_turn_duration_ms::double precision *
      interval '1 millisecond'
    );

  IF v_deadline_at <=
       v_started_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TURN_ADVANCEMENT_RULES_INVALID';
  END IF;


  -- ===================================================
  -- ATOMIC CURRENT-TURN TRANSITION
  -- ===================================================

  UPDATE public.cing_artillery_turn_states
  SET
    status =
      'active',

    turn_number =
      v_next_turn_number,

    active_account_id =
      v_next_account_id,

    active_session_id =
      v_next_session_id,

    turn_started_at =
      v_started_at,

    turn_deadline_at =
      v_deadline_at,

    updated_at =
      v_started_at

  WHERE id =
      v_turn.id
    AND combat_state_id =
      v_combat.id
    AND turn_number =
      p_expected_turn_number
    AND status =
      'active'
  RETURNING *
  INTO v_turn;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TURN_ADVANCEMENT_CONFLICT';
  END IF;


  -- ===================================================
  -- PERSISTENCE POSTCONDITION
  -- ===================================================

  IF v_turn.id <>
       p_turn_state_id
     OR v_turn.combat_state_id <>
       v_combat.id
     OR v_turn.match_runtime_id <>
       v_combat.match_runtime_id
     OR v_turn.match_id <>
       v_combat.match_id
     OR v_turn.status <>
       'active'
     OR v_turn.turn_number <>
       v_next_turn_number
     OR v_turn.active_account_id <>
       v_next_account_id
     OR v_turn.active_session_id <>
       v_next_session_id
     OR v_turn.initiative_reason <>
       v_original_initiative_reason
     OR v_turn.turn_started_at <>
       v_started_at
     OR v_turn.turn_deadline_at <>
       v_deadline_at
     OR v_turn.updated_at <>
       v_started_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TURN_ADVANCEMENT_INCONSISTENT';
  END IF;

  RETURN v_turn;
END;
$$;


-- =====================================================
-- PRIVATE HELPER ACL
--
-- No application role may execute this transition.
--
-- A future SECURITY DEFINER gameplay commit function,
-- executing as its PostgreSQL owner, may invoke this
-- primitive internally in the same transaction.
-- =====================================================

REVOKE ALL
ON FUNCTION
  public.cing_artillery_advance_turn_private(
    uuid,
    uuid,
    integer
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_advance_turn_private(
    uuid,
    uuid,
    integer
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_advance_turn_private(
    uuid,
    uuid,
    integer
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_advance_turn_private(
    uuid,
    uuid,
    integer
  )
FROM service_role;


COMMIT;
