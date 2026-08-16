BEGIN;

-- =====================================================
-- CING ARTILLERY — INITIATIVE AUTHORITY
--
-- First-turn policy:
--
--   higher immutable combat speed wins initiative
--
--   equal immutable combat speed:
--     cryptographically generated server-side tie-break
--
-- Durable result:
--
--   turn_states.status = active
--   turn_states.turn_number = 1
--   active account/session
--   initiative_reason
--   turn_started_at
--   turn_deadline_at
--
-- The caller provides only canonical combat_state_id.
--
-- No client-provided:
--   speed
--   winner
--   player identity
--   timer
--   initiative reason
--
-- PostgreSQL is the final durable authority.
-- =====================================================

ALTER TABLE
  public.cing_artillery_turn_states
ADD COLUMN IF NOT EXISTS
  initiative_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'cing_artillery_turn_states_initiative_reason_check'
      AND conrelid =
        'public.cing_artillery_turn_states'::regclass
  ) THEN
    ALTER TABLE
      public.cing_artillery_turn_states
    ADD CONSTRAINT
      cing_artillery_turn_states_initiative_reason_check
    CHECK (
      (
        status = 'pending'
        AND initiative_reason IS NULL
      )
      OR
      (
        status = 'active'
        AND initiative_reason IN (
          'speed',
          'speed_tiebreak'
        )
      )
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION
  public.cing_artillery_activate_first_turn_atomic(
    p_combat_state_id uuid
  )
RETURNS public.cing_artillery_turn_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_turn
    public.cing_artillery_turn_states%ROWTYPE;

  v_config jsonb;

  v_player_one_speed integer;
  v_player_two_speed integer;

  v_turn_duration_ms numeric;

  v_winner_account_id uuid;
  v_winner_session_id uuid;

  v_initiative_reason text;

  v_started_at timestamptz;
  v_deadline_at timestamptz;

  v_tiebreak_byte integer;
BEGIN
  IF p_combat_state_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_ID_REQUIRED';
  END IF;

  -- Defense in depth:
  -- service-role RPC cannot bypass the dark feature gate.
  SELECT
    cing_artillery_config
  INTO
    v_config
  FROM public.app_configs
  WHERE id = 1;

  IF NOT FOUND
     OR v_config IS NULL
     OR jsonb_typeof(
          v_config
        ) <> 'object'
     OR jsonb_typeof(
          v_config -> 'enabled'
        ) <> 'boolean'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_config_invalid';
  END IF;

  IF NOT (
    v_config ->> 'enabled'
  )::boolean THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_disabled';
  END IF;

  /*
   * Lock order is canonical:
   *
   *   combat state
   *       ->
   *   turn state
   *
   * This matches turn-state initialization and ensures
   * concurrent initiative attempts serialize before the
   * random tie-break can ever be evaluated.
   */
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

  IF v_combat.status <>
       'initialized'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_TURN_ELIGIBLE';
  END IF;

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

  -- Durable participant authority must remain identical.
  IF v_turn.match_runtime_id <>
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
          'CING_ARTILLERY_INITIATIVE_STATE_INCONSISTENT';
  END IF;

  /*
   * Idempotent re-entry.
   *
   * Once ACTIVE, initiative is already canonical.
   * Do not recompute speed, time or tie-break.
   */
  IF v_turn.status = 'active' THEN
    /*
     * Initiative activation is idempotent for the entire
     * active combat lifecycle, not only while turn #1 is
     * current.
     *
     * Rejoin/reconnect may trigger another start attempt
     * after later turn transitions. Once ACTIVE, initiative
     * must never reroll or reset the canonical turn timer.
     */
    IF v_turn.turn_number <= 0
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
            'CING_ARTILLERY_INITIATIVE_STATE_INCONSISTENT';
    END IF;

    RETURN v_turn;
  END IF;

  IF v_turn.status <> 'pending'
     OR v_turn.turn_number <> 0
     OR v_turn.active_account_id IS NOT NULL
     OR v_turn.active_session_id IS NOT NULL
     OR v_turn.initiative_reason IS NOT NULL
     OR v_turn.turn_started_at IS NOT NULL
     OR v_turn.turn_deadline_at IS NOT NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_INITIATIVE_STATE_INCONSISTENT';
  END IF;

  -- Validate immutable speed snapshots before casting.
  IF v_combat.player_one_stats_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.player_one_stats_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.player_one_stats_snapshot ->
            'speed'
        ) <> 'number'
     OR (
          v_combat.player_one_stats_snapshot ->>
            'speed'
        ) !~ '^[1-9][0-9]*$'
     OR (
          v_combat.player_one_stats_snapshot ->>
            'speed'
        )::numeric > 2147483647
     OR v_combat.player_two_stats_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.player_two_stats_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.player_two_stats_snapshot ->
            'speed'
        ) <> 'number'
     OR (
          v_combat.player_two_stats_snapshot ->>
            'speed'
        ) !~ '^[1-9][0-9]*$'
     OR (
          v_combat.player_two_stats_snapshot ->>
            'speed'
        )::numeric > 2147483647
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_INITIATIVE_COMBAT_STATS_INVALID';
  END IF;

  v_player_one_speed :=
    (
      v_combat.player_one_stats_snapshot ->>
        'speed'
    )::integer;

  v_player_two_speed :=
    (
      v_combat.player_two_stats_snapshot ->>
        'speed'
    )::integer;

  -- Timer authority comes only from immutable match rules.
  IF v_combat.rules_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.rules_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.rules_snapshot ->
            'turn_duration_ms'
        ) <> 'number'
     OR (
          v_combat.rules_snapshot ->>
            'turn_duration_ms'
        )::numeric <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_INITIATIVE_RULES_INVALID';
  END IF;

  v_turn_duration_ms :=
    (
      v_combat.rules_snapshot ->>
        'turn_duration_ms'
    )::numeric;

  IF v_player_one_speed >
       v_player_two_speed
  THEN
    v_winner_account_id :=
      v_combat.player_one_account_id;

    v_winner_session_id :=
      v_combat.player_one_session_id;

    v_initiative_reason :=
      'speed';

  ELSIF v_player_two_speed >
        v_player_one_speed
  THEN
    v_winner_account_id :=
      v_combat.player_two_account_id;

    v_winner_session_id :=
      v_combat.player_two_session_id;

    v_initiative_reason :=
      'speed';

  ELSE
    /*
     * Secure tie-break.
     *
     * gen_random_uuid() is generated by PostgreSQL using
     * cryptographically strong randomness. uuid_send()
     * exposes the UUID bytes; only the lowest bit is needed.
     *
     * Crucially this branch executes only while holding the
     * canonical combat + turn locks. Once persisted, later
     * callers return ACTIVE above and never reroll.
     */
    v_tiebreak_byte :=
      get_byte(
        uuid_send(
          gen_random_uuid()
        ),
        0
      );

    IF (
      v_tiebreak_byte % 2
    ) = 0 THEN
      v_winner_account_id :=
        v_combat.player_one_account_id;

      v_winner_session_id :=
        v_combat.player_one_session_id;
    ELSE
      v_winner_account_id :=
        v_combat.player_two_account_id;

      v_winner_session_id :=
        v_combat.player_two_session_id;
    END IF;

    v_initiative_reason :=
      'speed_tiebreak';
  END IF;

  -- PostgreSQL clock is authoritative for the first turn.
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
          'CING_ARTILLERY_INITIATIVE_RULES_INVALID';
  END IF;

  UPDATE public.cing_artillery_turn_states
  SET
    status =
      'active',

    turn_number =
      1,

    active_account_id =
      v_winner_account_id,

    active_session_id =
      v_winner_session_id,

    initiative_reason =
      v_initiative_reason,

    turn_started_at =
      v_started_at,

    turn_deadline_at =
      v_deadline_at,

    updated_at =
      v_started_at
  WHERE id =
    v_turn.id
  RETURNING *
  INTO v_turn;

  IF v_turn.id IS NULL
     OR v_turn.status <> 'active'
     OR v_turn.turn_number <> 1
     OR v_turn.active_account_id <>
        v_winner_account_id
     OR v_turn.active_session_id <>
        v_winner_session_id
     OR v_turn.initiative_reason <>
        v_initiative_reason
     OR v_turn.turn_started_at <>
        v_started_at
     OR v_turn.turn_deadline_at <>
        v_deadline_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_INITIATIVE_STATE_INCONSISTENT';
  END IF;

  RETURN v_turn;
END;
$$;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_activate_first_turn_atomic(
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_activate_first_turn_atomic(
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_activate_first_turn_atomic(
    uuid
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_activate_first_turn_atomic(
    uuid
  )
TO service_role;

COMMIT;
