BEGIN;

CREATE OR REPLACE FUNCTION
  public.cing_artillery_commit_resolution_private_contract(
    p_execution_id uuid,
    p_claim_token uuid,

    p_physics_version integer,
    p_outcome text,

    p_impact_exact_version integer,
    p_impact_physics_fixed_scale numeric,

    p_impact_start_x_scaled numeric,
    p_impact_start_y_scaled numeric,
    p_impact_delta_x_scaled numeric,
    p_impact_delta_y_scaled numeric,

    p_impact_contact_kind text,
    p_impact_contact_numerator numeric,
    p_impact_contact_denominator numeric,
    p_impact_contact_a numeric,
    p_impact_contact_b numeric,
    p_impact_contact_discriminant numeric,

    p_impact_projection_version integer,
    p_impact_x numeric,
    p_impact_y numeric,

    p_target_account_id uuid,
    p_damage numeric
  )
RETURNS public.cing_artillery_shot_resolutions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_turn
    public.cing_artillery_turn_states%ROWTYPE;

  v_execution
    public.cing_artillery_shot_executions%ROWTYPE;

  v_command
    public.cing_artillery_shot_commands%ROWTYPE;

  v_world
    public.cing_artillery_combat_world_states%ROWTYPE;

  v_existing
    public.cing_artillery_shot_resolutions%ROWTYPE;

  v_vital
    public.cing_artillery_combat_vital_states%ROWTYPE;

  v_now timestamptz;

  v_expected_target_account_id uuid;
BEGIN
  IF p_execution_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_EXECUTION_ID_REQUIRED';
  END IF;

  IF p_claim_token IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_CLAIM_TOKEN_REQUIRED';
  END IF;

  IF p_physics_version IS NULL
     OR p_physics_version <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_PHYSICS_VERSION_INVALID';
  END IF;

  IF p_outcome NOT IN (
       'player_hit',
       'terrain_hit',
       'out_of_bounds',
       'flight_horizon_exhausted'
     )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_OUTCOME_INVALID';
  END IF;

  IF p_damage IS NULL
     OR p_damage IN (
          'NaN'::numeric,
          'Infinity'::numeric,
          '-Infinity'::numeric
        )
     OR p_damage < 0
     OR trunc(p_damage) <> p_damage
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_DAMAGE_INVALID';
  END IF;

  SELECT e.*
  INTO v_execution
  FROM public.cing_artillery_shot_executions AS e
  WHERE e.id =
    p_execution_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_NOT_FOUND';
  END IF;

  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.id =
    v_execution.combat_state_id
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
    v_execution.turn_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_TURN_STATE_NOT_FOUND';
  END IF;

  SELECT e.*
  INTO v_execution
  FROM public.cing_artillery_shot_executions AS e
  WHERE e.id =
    p_execution_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_NOT_FOUND';
  END IF;

  IF v_execution.combat_state_id <>
       v_combat.id
     OR v_execution.turn_state_id <>
       v_turn.id
     OR v_execution.match_runtime_id <>
       v_combat.match_runtime_id
     OR v_execution.match_id <>
       v_combat.match_id
     OR v_execution.turn_number <>
       v_turn.turn_number
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_EXECUTION_CHAIN_INCONSISTENT';
  END IF;

  IF v_execution.claim_token IS DISTINCT FROM
       p_claim_token
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_CLAIM_CONFLICT';
  END IF;

  SELECT r.*
  INTO v_existing
  FROM public.cing_artillery_shot_resolutions AS r
  WHERE r.execution_id =
    v_execution.id;

  IF FOUND THEN
    IF v_execution.status <>
         'completed'
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_EXISTING_EXECUTION_NOT_COMPLETED';
    END IF;

    RETURN v_existing;
  END IF;

  IF v_execution.status <>
       'processing'
     OR v_execution.locked_until IS NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_NOT_PROCESSING';
  END IF;

  v_now :=
    clock_timestamp();

  IF v_now >=
       v_execution.locked_until
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_LEASE_EXPIRED';
  END IF;

  SELECT sc.*
  INTO v_command
  FROM public.cing_artillery_shot_commands AS sc
  WHERE sc.id =
    v_execution.shot_command_id;

  IF NOT FOUND
     OR v_command.combat_state_id <>
        v_execution.combat_state_id
     OR v_command.turn_state_id <>
        v_execution.turn_state_id
     OR v_command.match_runtime_id <>
        v_execution.match_runtime_id
     OR v_command.match_id <>
        v_execution.match_id
     OR v_command.turn_number <>
        v_execution.turn_number
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_COMMAND_CHAIN_INCONSISTENT';
  END IF;

  IF v_turn.combat_state_id <>
       v_combat.id
     OR v_turn.match_runtime_id <>
       v_combat.match_runtime_id
     OR v_turn.match_id <>
       v_combat.match_id
     OR v_turn.status <>
       'active'
     OR v_turn.turn_number <>
       v_execution.turn_number
     OR v_turn.active_account_id <>
       v_command.shooter_account_id
     OR v_turn.active_session_id <>
       v_command.shooter_session_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_TURN_CHAIN_INCONSISTENT';
  END IF;

  SELECT w.*
  INTO v_world
  FROM public.cing_artillery_combat_world_states AS w
  WHERE w.combat_state_id =
    v_combat.id;

  IF NOT FOUND
     OR v_world.match_runtime_id <>
        v_combat.match_runtime_id
     OR v_world.match_id <>
        v_combat.match_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_WORLD_CHAIN_INCONSISTENT';
  END IF;

  IF v_combat.rules_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.rules_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.rules_snapshot ->
            'physics_version'
        ) <> 'number'
     OR (
          v_combat.rules_snapshot ->>
            'physics_version'
        )::integer <>
        p_physics_version
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_PHYSICS_VERSION_MISMATCH';
  END IF;

  IF v_turn.active_account_id =
       v_combat.player_one_account_id
     AND v_turn.active_session_id =
       v_combat.player_one_session_id
  THEN
    v_expected_target_account_id :=
      v_combat.player_two_account_id;

  ELSIF v_turn.active_account_id =
          v_combat.player_two_account_id
        AND v_turn.active_session_id =
          v_combat.player_two_session_id
  THEN
    v_expected_target_account_id :=
      v_combat.player_one_account_id;

  ELSE
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_ACTIVE_PARTICIPANT_INVALID';
  END IF;

  IF p_damage > 0
     AND p_target_account_id IS DISTINCT FROM
       v_expected_target_account_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_TARGET_INVALID';
  END IF;

  IF p_damage = 0
     AND p_target_account_id IS NOT NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_ZERO_DAMAGE_TARGET_INVALID';
  END IF;

  SELECT v.*
  INTO v_vital
  FROM public.cing_artillery_combat_vital_states AS v
  WHERE v.combat_state_id =
    v_combat.id
  FOR UPDATE;

  IF NOT FOUND
     OR v_vital.match_runtime_id <>
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
          'CING_ARTILLERY_RESOLUTION_VITAL_CHAIN_INCONSISTENT';
  END IF;

  RAISE EXCEPTION
    USING
      ERRCODE = '0A000',
      MESSAGE =
        'CING_ARTILLERY_RESOLUTION_COMMIT_CONTRACT_ONLY';
END;
$$;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_commit_resolution_private_contract(
    uuid,
    uuid,
    integer,
    text,
    integer,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    integer,
    numeric,
    numeric,
    uuid,
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_commit_resolution_private_contract(
    uuid,
    uuid,
    integer,
    text,
    integer,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    integer,
    numeric,
    numeric,
    uuid,
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_commit_resolution_private_contract(
    uuid,
    uuid,
    integer,
    text,
    integer,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    integer,
    numeric,
    numeric,
    numeric,
    uuid,
    numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_commit_resolution_private_contract(
    uuid,
    uuid,
    integer,
    text,
    integer,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    integer,
    numeric,
    numeric,
    numeric,
    uuid,
    numeric
  )
FROM service_role;

COMMIT;
