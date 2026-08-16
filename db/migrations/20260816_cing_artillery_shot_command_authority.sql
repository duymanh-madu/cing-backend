BEGIN;

-- =====================================================
-- CING ARTILLERY — SHOT COMMAND AUTHORITY
--
-- Durable accepted-shot authority.
--
-- Caller supplies:
--   combat_state_id
--   shooter account/session identity
--   expected turn_number
--   command_id (idempotency key)
--   angle_deg
--   power
--
-- PostgreSQL validates against canonical:
--   combat state
--   turn state
--   immutable rules snapshot
--   authoritative PostgreSQL clock
--
-- Exactly one accepted shot is permitted per turn.
--
-- Retry semantics:
--   same command_id + exact same canonical request
--     => returns the existing accepted command
--
--   same command_id + different request
--     => rejected as idempotency conflict
--
-- No projectile physics, damage, HP mutation, scoring,
-- next-turn transition or match completion is performed
-- in this authority phase.
-- =====================================================

CREATE TABLE IF NOT EXISTS
  public.cing_artillery_shot_commands (
    id uuid PRIMARY KEY,

    command_id uuid NOT NULL,

    combat_state_id uuid NOT NULL
      REFERENCES public.cing_artillery_combat_states(id)
      ON DELETE RESTRICT,

    turn_state_id uuid NOT NULL
      REFERENCES public.cing_artillery_turn_states(id)
      ON DELETE RESTRICT,

    match_runtime_id uuid NOT NULL
      REFERENCES public.cing_artillery_match_runtimes(id)
      ON DELETE RESTRICT,

    match_id uuid NOT NULL
      REFERENCES public.cing_artillery_matches(id)
      ON DELETE RESTRICT,

    turn_number integer NOT NULL,

    shooter_account_id uuid NOT NULL
      REFERENCES public.cing_artillery_accounts(id)
      ON DELETE RESTRICT,

    shooter_session_id uuid NOT NULL
      REFERENCES public.cing_artillery_gameplay_sessions(id)
      ON DELETE RESTRICT,

    angle_deg numeric NOT NULL,

    power numeric NOT NULL,

    accepted_at timestamptz NOT NULL,

    created_at timestamptz NOT NULL
      DEFAULT now(),

    CONSTRAINT
      cing_artillery_shot_commands_turn_number_check
      CHECK (
        turn_number > 0
      ),

    CONSTRAINT
      cing_artillery_shot_commands_angle_finite_check
      CHECK (
        angle_deg <> 'NaN'::numeric
      ),

    CONSTRAINT
      cing_artillery_shot_commands_power_finite_check
      CHECK (
        power <> 'NaN'::numeric
      )
  );

-- =====================================================
-- TABLE ACCESS AUTHORITY
--
-- Durable command writes are RPC-only.
--
-- anon/authenticated:
--   no direct access
--
-- service_role:
--   read-only table access
--   writes must pass through the SECURITY DEFINER RPC
--
-- RLS is an additional defense layer; explicit ACLs remain
-- authoritative even for environments where default grants
-- change in the future.
-- =====================================================

ALTER TABLE
  public.cing_artillery_shot_commands
ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE
  public.cing_artillery_shot_commands
FROM PUBLIC;

REVOKE ALL
ON TABLE
  public.cing_artillery_shot_commands
FROM anon;

REVOKE ALL
ON TABLE
  public.cing_artillery_shot_commands
FROM authenticated;

REVOKE ALL
ON TABLE
  public.cing_artillery_shot_commands
FROM service_role;

GRANT SELECT
ON TABLE
  public.cing_artillery_shot_commands
TO service_role;

-- command_id is globally unique and is the durable
-- idempotency identity for one client command.
CREATE UNIQUE INDEX IF NOT EXISTS
  cing_artillery_shot_commands_command_uidx
ON public.cing_artillery_shot_commands (
  command_id
);

-- Exactly one accepted shot per canonical combat turn.
CREATE UNIQUE INDEX IF NOT EXISTS
  cing_artillery_shot_commands_combat_turn_uidx
ON public.cing_artillery_shot_commands (
  combat_state_id,
  turn_number
);

CREATE INDEX IF NOT EXISTS
  cing_artillery_shot_commands_runtime_idx
ON public.cing_artillery_shot_commands (
  match_runtime_id,
  turn_number
);

CREATE INDEX IF NOT EXISTS
  cing_artillery_shot_commands_shooter_idx
ON public.cing_artillery_shot_commands (
  shooter_account_id,
  accepted_at DESC
);

-- =====================================================
-- ATOMIC SHOT ACCEPTANCE
--
-- Canonical lock order:
--
--   combat state
--       ->
--   turn state
--
-- This preserves the established combat lock order.
--
-- Idempotent command lookup is intentionally performed
-- only after those canonical locks are held, so a retry
-- cannot bypass current authority validation through a
-- racing transaction.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_accept_shot_command_atomic(
    p_combat_state_id uuid,
    p_shooter_account_id uuid,
    p_shooter_session_id uuid,
    p_turn_number integer,
    p_command_id uuid,
    p_angle_deg numeric,
    p_power numeric
  )
RETURNS public.cing_artillery_shot_commands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_turn
    public.cing_artillery_turn_states%ROWTYPE;

  v_command
    public.cing_artillery_shot_commands%ROWTYPE;

  v_existing_turn_command
    public.cing_artillery_shot_commands%ROWTYPE;

  v_config jsonb;

  v_angle_min numeric;
  v_angle_max numeric;
  v_power_min numeric;
  v_power_max numeric;

  v_accepted_at timestamptz;
BEGIN
  IF p_combat_state_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_ID_REQUIRED';
  END IF;

  IF p_shooter_account_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOOTER_ACCOUNT_ID_REQUIRED';
  END IF;

  IF p_shooter_session_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOOTER_SESSION_ID_REQUIRED';
  END IF;

  IF p_turn_number IS NULL
     OR p_turn_number <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_TURN_NUMBER_INVALID';
  END IF;

  IF p_command_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_COMMAND_ID_REQUIRED';
  END IF;

  IF p_angle_deg IS NULL
     OR p_angle_deg = 'NaN'::numeric
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_ANGLE_INVALID';
  END IF;

  IF p_power IS NULL
     OR p_power = 'NaN'::numeric
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_POWER_INVALID';
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
     OR jsonb_typeof(v_config) <> 'object'
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
          'CING_ARTILLERY_COMBAT_STATE_NOT_SHOT_ELIGIBLE';
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

  -- Durable authority chain must remain exact.
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
          'CING_ARTILLERY_SHOT_STATE_INCONSISTENT';
  END IF;

  /*
   * Resolve an already accepted command only while holding
   * canonical combat + turn locks.
   *
   * A retry is valid only when every request field is
   * identical to the durable accepted command.
   */
  SELECT s.*
  INTO v_command
  FROM public.cing_artillery_shot_commands AS s
  WHERE s.command_id =
    p_command_id;

  IF FOUND THEN
    IF v_command.combat_state_id <>
         v_combat.id
       OR v_command.turn_state_id <>
         v_turn.id
       OR v_command.match_runtime_id <>
         v_combat.match_runtime_id
       OR v_command.match_id <>
         v_combat.match_id
       OR v_command.turn_number <>
         p_turn_number
       OR v_command.shooter_account_id <>
         p_shooter_account_id
       OR v_command.shooter_session_id <>
         p_shooter_session_id
       OR v_command.angle_deg <>
         p_angle_deg
       OR v_command.power <>
         p_power
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_SHOT_COMMAND_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN v_command;
  END IF;

  -- New commands are accepted only against the exact
  -- currently active canonical turn.
  IF v_turn.status <> 'active'
     OR v_turn.turn_number <= 0
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
          'CING_ARTILLERY_TURN_NOT_ACTIVE';
  END IF;

  IF v_turn.turn_number <>
       p_turn_number
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_TURN_MISMATCH';
  END IF;

  IF v_turn.active_account_id <>
       p_shooter_account_id
     OR v_turn.active_session_id <>
       p_shooter_session_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_NOT_ACTIVE_PARTICIPANT';
  END IF;

  -- Rules come exclusively from immutable combat snapshot.
  IF v_combat.rules_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.rules_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.rules_snapshot ->
            'angle_min_deg'
        ) <> 'number'
     OR jsonb_typeof(
          v_combat.rules_snapshot ->
            'angle_max_deg'
        ) <> 'number'
     OR jsonb_typeof(
          v_combat.rules_snapshot ->
            'power_min'
        ) <> 'number'
     OR jsonb_typeof(
          v_combat.rules_snapshot ->
            'power_max'
        ) <> 'number'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_RULES_INVALID';
  END IF;

  v_angle_min :=
    (
      v_combat.rules_snapshot ->>
        'angle_min_deg'
    )::numeric;

  v_angle_max :=
    (
      v_combat.rules_snapshot ->>
        'angle_max_deg'
    )::numeric;

  v_power_min :=
    (
      v_combat.rules_snapshot ->>
        'power_min'
    )::numeric;

  v_power_max :=
    (
      v_combat.rules_snapshot ->>
        'power_max'
    )::numeric;

  IF v_angle_min = 'NaN'::numeric
     OR v_angle_max = 'NaN'::numeric
     OR v_power_min = 'NaN'::numeric
     OR v_power_max = 'NaN'::numeric
     OR v_angle_min >
        v_angle_max
     OR v_power_min >
        v_power_max
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_RULES_INVALID';
  END IF;

  IF p_angle_deg <
       v_angle_min
     OR p_angle_deg >
        v_angle_max
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_ANGLE_OUT_OF_RANGE';
  END IF;

  IF p_power <
       v_power_min
     OR p_power >
        v_power_max
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_POWER_OUT_OF_RANGE';
  END IF;

  /*
   * PostgreSQL clock is authoritative.
   *
   * Deadline equality is expired: a new command must arrive
   * strictly before turn_deadline_at.
   */
  v_accepted_at :=
    clock_timestamp();

  IF v_accepted_at >=
       v_turn.turn_deadline_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_TURN_EXPIRED';
  END IF;

  -- Defensive explicit check before relying on the unique
  -- index. Under canonical turn lock this should be stable.
  SELECT s.*
  INTO v_existing_turn_command
  FROM public.cing_artillery_shot_commands AS s
  WHERE s.combat_state_id =
      v_combat.id
    AND s.turn_number =
      v_turn.turn_number;

  IF FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_ALREADY_ACCEPTED_FOR_TURN';
  END IF;

  INSERT INTO public.cing_artillery_shot_commands (
    id,
    command_id,
    combat_state_id,
    turn_state_id,
    match_runtime_id,
    match_id,
    turn_number,
    shooter_account_id,
    shooter_session_id,
    angle_deg,
    power,
    accepted_at
  )
  VALUES (
    gen_random_uuid(),
    p_command_id,
    v_combat.id,
    v_turn.id,
    v_combat.match_runtime_id,
    v_combat.match_id,
    v_turn.turn_number,
    p_shooter_account_id,
    p_shooter_session_id,
    p_angle_deg,
    p_power,
    v_accepted_at
  )
  RETURNING *
  INTO v_command;

  IF v_command.id IS NULL
     OR v_command.command_id <>
        p_command_id
     OR v_command.combat_state_id <>
        v_combat.id
     OR v_command.turn_state_id <>
        v_turn.id
     OR v_command.match_runtime_id <>
        v_combat.match_runtime_id
     OR v_command.match_id <>
        v_combat.match_id
     OR v_command.turn_number <>
        v_turn.turn_number
     OR v_command.shooter_account_id <>
        p_shooter_account_id
     OR v_command.shooter_session_id <>
        p_shooter_session_id
     OR v_command.angle_deg <>
        p_angle_deg
     OR v_command.power <>
        p_power
     OR v_command.accepted_at <>
        v_accepted_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_COMMAND_PERSISTENCE_INCONSISTENT';
  END IF;

  RETURN v_command;
END;
$$;

-- Private server-side RPC only.
REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic(
    uuid,
    uuid,
    uuid,
    integer,
    uuid,
    numeric,
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic(
    uuid,
    uuid,
    uuid,
    integer,
    uuid,
    numeric,
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic(
    uuid,
    uuid,
    uuid,
    integer,
    uuid,
    numeric,
    numeric
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic(
    uuid,
    uuid,
    uuid,
    integer,
    uuid,
    numeric,
    numeric
  )
TO service_role;

COMMIT;
