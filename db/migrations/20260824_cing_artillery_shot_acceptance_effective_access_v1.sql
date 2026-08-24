BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- SHOT ACCEPTANCE EFFECTIVE ACCESS V1
--
-- New durable shot:
--   command-id idempotent recovery first
--   then canonical participant-pair effective access
--   then shot INSERT.
--
-- Existing accepted command:
--   access-independent idempotent recovery.
--
-- Existing execution:
--   access-independent durable continuation recovery.
--
-- First execution enqueue:
--   requires current participant-pair effective access.
--
-- Post-accept worker / retry / fenced resolution /
-- turn advancement / terminal completion remain untouched.
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.cing_artillery_accept_shot_command_atomic_pre_angle_grid(
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


  /*
   * Effective access applies only to NEW durable shot
   * progression.
   *
   * Exact command-id recovery above remains valid after
   * membership revocation.
   *
   * Participant identities are taken from the canonical
   * locked combat state.
   */
  IF NOT
    public.cing_artillery_participants_have_effective_gameplay_access_private_v1(
      v_combat.player_one_account_id,
      v_combat.player_two_account_id
    )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_disabled';
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


CREATE OR REPLACE FUNCTION
  public.cing_artillery_accept_shot_command_with_execution_atomic(
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
  v_command
    public.cing_artillery_shot_commands%ROWTYPE;

  v_execution
    public.cing_artillery_shot_executions%ROWTYPE;

  v_combat
    public.cing_artillery_combat_states%ROWTYPE;
BEGIN
  SELECT *
  INTO v_command
  FROM public.cing_artillery_accept_shot_command_atomic(
    p_combat_state_id,
    p_shooter_account_id,
    p_shooter_session_id,
    p_turn_number,
    p_command_id,
    p_angle_deg,
    p_power
  );

  IF v_command.id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_COMMAND_MISSING';
  END IF;


  /*
   * Existing execution is durable post-accept continuation.
   * Recover it before any current-access decision.
   */
  SELECT e.*
  INTO v_execution
  FROM public.cing_artillery_shot_executions AS e
  WHERE e.shot_command_id =
    v_command.id;

  IF FOUND THEN
    IF v_execution.combat_state_id <>
         v_command.combat_state_id
       OR v_execution.turn_state_id <>
          v_command.turn_state_id
       OR v_execution.match_runtime_id <>
          v_command.match_runtime_id
       OR v_execution.match_id <>
          v_command.match_id
       OR v_execution.turn_number <>
          v_command.turn_number
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_SHOT_EXECUTION_INCONSISTENT';
    END IF;

    RETURN v_command;
  END IF;


  /*
   * First execution enqueue for an already accepted command
   * still constitutes new user-driven progression.
   *
   * It therefore requires current access.
   */
  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.id =
    v_command.combat_state_id;

  IF NOT FOUND
     OR v_combat.id <>
        v_command.combat_state_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_STATE_INCONSISTENT';
  END IF;

  IF NOT
    public.cing_artillery_participants_have_effective_gameplay_access_private_v1(
      v_combat.player_one_account_id,
      v_combat.player_two_account_id
    )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_disabled';
  END IF;

  INSERT INTO
    public.cing_artillery_shot_executions (
      id,
      shot_command_id,
      combat_state_id,
      turn_state_id,
      match_runtime_id,
      match_id,
      turn_number,
      status,
      attempt_count
    )
  VALUES (
    gen_random_uuid(),
    v_command.id,
    v_command.combat_state_id,
    v_command.turn_state_id,
    v_command.match_runtime_id,
    v_command.match_id,
    v_command.turn_number,
    'pending',
    0
  )
  ON CONFLICT (shot_command_id)
  DO NOTHING;

  SELECT e.*
  INTO v_execution
  FROM public.cing_artillery_shot_executions AS e
  WHERE e.shot_command_id =
    v_command.id;

  IF NOT FOUND
     OR v_execution.combat_state_id <>
        v_command.combat_state_id
     OR v_execution.turn_state_id <>
        v_command.turn_state_id
     OR v_execution.match_runtime_id <>
        v_command.match_runtime_id
     OR v_execution.match_id <>
        v_command.match_id
     OR v_execution.turn_number <>
        v_command.turn_number
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_INCONSISTENT';
  END IF;

  RETURN v_command;
END;
$$;


-- =====================================================
-- ACL
--
-- Application code may call only the canonical
-- accept+execution wrapper.
-- =====================================================

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic(
    uuid, uuid, uuid, integer, uuid, numeric, numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic(
    uuid, uuid, uuid, integer, uuid, numeric, numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic(
    uuid, uuid, uuid, integer, uuid, numeric, numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic(
    uuid, uuid, uuid, integer, uuid, numeric, numeric
  )
FROM service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic_pre_angle_grid(
    uuid, uuid, uuid, integer, uuid, numeric, numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic_pre_angle_grid(
    uuid, uuid, uuid, integer, uuid, numeric, numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic_pre_angle_grid(
    uuid, uuid, uuid, integer, uuid, numeric, numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic_pre_angle_grid(
    uuid, uuid, uuid, integer, uuid, numeric, numeric
  )
FROM service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_with_execution_atomic(
    uuid, uuid, uuid, integer, uuid, numeric, numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_with_execution_atomic(
    uuid, uuid, uuid, integer, uuid, numeric, numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_with_execution_atomic(
    uuid, uuid, uuid, integer, uuid, numeric, numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_with_execution_atomic(
    uuid, uuid, uuid, integer, uuid, numeric, numeric
  )
FROM service_role;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_accept_shot_command_with_execution_atomic(
    uuid, uuid, uuid, integer, uuid, numeric, numeric
  )
TO service_role;


COMMIT;
