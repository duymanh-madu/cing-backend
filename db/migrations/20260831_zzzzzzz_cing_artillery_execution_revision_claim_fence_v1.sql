BEGIN;

ALTER TABLE public.cing_artillery_shot_executions
  ADD COLUMN IF NOT EXISTS
    expected_terrain_revision_claim_token uuid;

ALTER TABLE public.cing_artillery_shot_executions
  DROP CONSTRAINT IF EXISTS
    cing_artillery_shot_executions_expected_terrain_revision_binding_ck;

ALTER TABLE public.cing_artillery_shot_executions
  ADD CONSTRAINT
    cing_artillery_shot_executions_expected_terrain_revision_binding_ck
  CHECK (
    (
      expected_terrain_revision IS NULL
      AND expected_terrain_revision_claim_token IS NULL
    )
    OR
    (
      expected_terrain_revision IS NOT NULL
      AND expected_terrain_revision >= 0
      AND expected_terrain_revision_claim_token IS NOT NULL
    )
  );

COMMENT ON COLUMN
  public.cing_artillery_shot_executions.expected_terrain_revision_claim_token
IS
  'Claim token owning expected_terrain_revision for deterministic mutable-terrain execution fencing.';

CREATE OR REPLACE FUNCTION
  public.cing_artillery_materialize_shot_execution_context_atomic(
    p_execution_id uuid,
    p_claim_token uuid
  )
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_execution public.cing_artillery_shot_executions%ROWTYPE;
  v_combat public.cing_artillery_combat_states%ROWTYPE;
  v_turn public.cing_artillery_turn_states%ROWTYPE;
  v_world public.cing_artillery_combat_world_states%ROWTYPE;
  v_command public.cing_artillery_shot_commands%ROWTYPE;
  v_terrain public.cing_artillery_combat_terrain_states%ROWTYPE;
  v_player_one public.cing_artillery_player_world_states%ROWTYPE;
  v_player_two public.cing_artillery_player_world_states%ROWTYPE;
  v_shooter public.cing_artillery_player_world_states%ROWTYPE;
  v_opponent public.cing_artillery_player_world_states%ROWTYPE;
  v_now timestamptz;
BEGIN
  IF p_execution_id IS NULL THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_EXECUTION_CONTEXT_ID_REQUIRED'
      USING ERRCODE = '22023';
  END IF;

  IF p_claim_token IS NULL THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_EXECUTION_CONTEXT_CLAIM_TOKEN_REQUIRED'
      USING ERRCODE = '22023';
  END IF;

  v_now := clock_timestamp();

  SELECT *
  INTO v_execution
  FROM public.cing_artillery_shot_executions
  WHERE id = p_execution_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_EXECUTION_CONTEXT_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_execution.status <> 'processing'
     OR v_execution.claim_token IS DISTINCT FROM p_claim_token
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_EXECUTION_CONTEXT_CLAIM_CONFLICT'
      USING ERRCODE = '40001';
  END IF;

  IF v_execution.locked_until IS NULL
     OR v_execution.locked_until <= v_now
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_EXECUTION_CONTEXT_LEASE_EXPIRED'
      USING ERRCODE = '40001';
  END IF;

  SELECT *
  INTO v_combat
  FROM public.cing_artillery_combat_states
  WHERE id = v_execution.combat_state_id
  FOR SHARE;

  IF NOT FOUND
     OR v_combat.status <> 'initialized'
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_EXECUTION_CONTEXT_COMBAT_INVALID'
      USING ERRCODE = '55000';
  END IF;

  SELECT *
  INTO v_turn
  FROM public.cing_artillery_turn_states
  WHERE id = v_execution.turn_state_id
  FOR SHARE;

  IF NOT FOUND
     OR v_turn.combat_state_id <> v_execution.combat_state_id
     OR v_turn.match_runtime_id <> v_execution.match_runtime_id
     OR v_turn.match_id <> v_execution.match_id
     OR v_turn.turn_number <> v_execution.turn_number
     OR v_turn.status <> 'active'
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_EXECUTION_CONTEXT_TURN_INVALID'
      USING ERRCODE = '55000';
  END IF;

  SELECT *
  INTO v_world
  FROM public.cing_artillery_combat_world_states
  WHERE combat_state_id = v_execution.combat_state_id
  FOR SHARE;

  IF NOT FOUND
     OR v_world.match_runtime_id <> v_execution.match_runtime_id
     OR v_world.match_id <> v_execution.match_id
     OR v_world.initial_wind_scaled IS NULL
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_EXECUTION_CONTEXT_WORLD_INVALID'
      USING ERRCODE = '55000';
  END IF;

  SELECT *
  INTO v_command
  FROM public.cing_artillery_shot_commands
  WHERE id = v_execution.shot_command_id
  FOR SHARE;

  IF NOT FOUND
     OR v_command.combat_state_id <> v_execution.combat_state_id
     OR v_command.turn_state_id <> v_execution.turn_state_id
     OR v_command.match_runtime_id <> v_execution.match_runtime_id
     OR v_command.match_id <> v_execution.match_id
     OR v_command.turn_number <> v_execution.turn_number
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_EXECUTION_CONTEXT_COMMAND_INVALID'
      USING ERRCODE = '55000';
  END IF;

  SELECT *
  INTO v_terrain
  FROM public.cing_artillery_combat_terrain_states
  WHERE combat_state_id = v_execution.combat_state_id
  FOR SHARE;

  IF NOT FOUND
     OR v_terrain.match_runtime_id <> v_execution.match_runtime_id
     OR v_terrain.match_id <> v_execution.match_id
     OR v_terrain.terrain_revision < 0
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_EXECUTION_CONTEXT_TERRAIN_INVALID'
      USING ERRCODE = '55000';
  END IF;

  SELECT *
  INTO v_player_one
  FROM public.cing_artillery_player_world_states
  WHERE combat_state_id = v_execution.combat_state_id
    AND participant_slot = 1
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_EXECUTION_CONTEXT_PLAYER_ONE_MISSING'
      USING ERRCODE = '55000';
  END IF;

  SELECT *
  INTO v_player_two
  FROM public.cing_artillery_player_world_states
  WHERE combat_state_id = v_execution.combat_state_id
    AND participant_slot = 2
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_EXECUTION_CONTEXT_PLAYER_TWO_MISSING'
      USING ERRCODE = '55000';
  END IF;

  IF v_player_one.match_runtime_id <> v_execution.match_runtime_id
     OR v_player_one.match_id <> v_execution.match_id
     OR v_player_two.match_runtime_id <> v_execution.match_runtime_id
     OR v_player_two.match_id <> v_execution.match_id
     OR v_player_one.motion_state <> 'stable'
     OR v_player_two.motion_state <> 'stable'
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_EXECUTION_CONTEXT_PLAYER_WORLD_INVALID'
      USING ERRCODE = '55000';
  END IF;

  IF v_command.shooter_account_id = v_player_one.account_id THEN
    v_shooter := v_player_one;
    v_opponent := v_player_two;
  ELSIF v_command.shooter_account_id = v_player_two.account_id THEN
    v_shooter := v_player_two;
    v_opponent := v_player_one;
  ELSE
    RAISE EXCEPTION
      'CING_ARTILLERY_EXECUTION_CONTEXT_SHOOTER_INVALID'
      USING ERRCODE = '55000';
  END IF;

  IF v_turn.active_account_id <> v_shooter.account_id THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_EXECUTION_CONTEXT_ACTIVE_PLAYER_MISMATCH'
      USING ERRCODE = '55000';
  END IF;

  IF v_execution.expected_terrain_revision_claim_token
       IS DISTINCT FROM p_claim_token
  THEN
    UPDATE public.cing_artillery_shot_executions
    SET
      expected_terrain_revision =
        v_terrain.terrain_revision,
      expected_terrain_revision_claim_token =
        p_claim_token
    WHERE id = v_execution.id
      AND status = 'processing'
      AND claim_token = p_claim_token;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'CING_ARTILLERY_EXECUTION_CONTEXT_REVISION_BIND_FAILED'
        USING ERRCODE = '40001';
    END IF;

    v_execution.expected_terrain_revision :=
      v_terrain.terrain_revision;

    v_execution.expected_terrain_revision_claim_token :=
      p_claim_token;

  ELSIF v_execution.expected_terrain_revision IS NULL
        OR v_execution.expected_terrain_revision
             <> v_terrain.terrain_revision
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_EXECUTION_CONTEXT_TERRAIN_STALE'
      USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'execution_id', v_execution.id,
    'claim_token', v_execution.claim_token,
    'shot_command_id', v_execution.shot_command_id,
    'combat_state_id', v_execution.combat_state_id,
    'turn_state_id', v_execution.turn_state_id,
    'match_runtime_id', v_execution.match_runtime_id,
    'match_id', v_execution.match_id,
    'turn_number', v_execution.turn_number,

    'angle_deg', v_command.angle_deg,
    'power', v_command.power,

    'active_account_id', v_turn.active_account_id,

    'shooter_account_id', v_shooter.account_id,
    'shooter_position_x', v_shooter.position_x,
    'shooter_position_y', v_shooter.position_y,

    'opponent_account_id', v_opponent.account_id,
    'opponent_position_x', v_opponent.position_x,
    'opponent_position_y', v_opponent.position_y,

    'terrain_revision', v_terrain.terrain_revision,
    'terrain_revision_claim_token',
      v_execution.expected_terrain_revision_claim_token,
    'terrain_width_px', v_terrain.width_px,
    'terrain_height_px', v_terrain.height_px,
    'collision_mask_hex', encode(v_terrain.collision_mask, 'hex'),

    'rules_snapshot', v_combat.rules_snapshot,
    'initial_wind_scaled', v_world.initial_wind_scaled
  );
END;
$function$;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_materialize_shot_execution_context_atomic(
    uuid,
    uuid
  )
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_materialize_shot_execution_context_atomic(
    uuid,
    uuid
  )
TO service_role;

CREATE OR REPLACE FUNCTION
  public.cing_artillery_commit_resolution_fenced_atomic(
    p_execution_id uuid,
    p_claim_token uuid,

    p_physics_version integer,
    p_outcome text,

    p_impact_exact_version integer,
    p_impact_physics_fixed_scale bigint,

    p_impact_start_x_scaled bigint,
    p_impact_start_y_scaled bigint,
    p_impact_delta_x_scaled bigint,
    p_impact_delta_y_scaled bigint,

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
  v_locator
    public.cing_artillery_shot_executions%ROWTYPE;

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

  v_map
    public.cing_artillery_maps%ROWTYPE;

  v_terrain
    public.cing_artillery_combat_terrain_states%ROWTYPE;

  v_player_one_world
    public.cing_artillery_player_world_states%ROWTYPE;

  v_player_two_world
    public.cing_artillery_player_world_states%ROWTYPE;

  v_crater_result jsonb;
  v_support_result jsonb;

  v_existing
    public.cing_artillery_shot_resolutions%ROWTYPE;

  v_resolution
    public.cing_artillery_shot_resolutions%ROWTYPE;

  v_vital
    public.cing_artillery_combat_vital_states%ROWTYPE;

  v_now timestamptz;

  v_rules_version integer;
  v_rules_physics_version integer;
  v_rules_physics_fixed_scale bigint;

  v_rules_projectile_radius_scaled bigint;
  v_rules_player_hit_radius_scaled bigint;
  v_rules_player_hit_center_offset_y_scaled bigint;
  v_rules_blast_radius_scaled bigint;

  v_expected_target_account_id uuid;

  v_opponent_center_x_scaled bigint;
  v_opponent_center_y_scaled bigint;

  v_attacker_attack integer;
  v_defender_defense integer;

  v_caller_contact jsonb;
  v_segment_event jsonb;

  v_blast_relation text;
  v_blast_distance_floor_scaled bigint;

  v_canonical_target_account_id uuid;
  v_canonical_damage numeric;

  v_target_post_hp numeric;
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

  IF p_outcome IS NULL
     OR p_outcome NOT IN (
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


  /*
   * Pre-read only locates immutable execution identity.
   * Mutable execution lifecycle is re-read under lock below.
   */
  SELECT e.*
  INTO v_locator
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


  /*
   * Canonical outer lock order:
   *
   * combat
   *   -> turn
   *   -> execution
   *   -> vital
   *
   * Terminal private authority may subsequently acquire:
   *
   * runtime
   *   -> match
   */
  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.id =
    v_locator.combat_state_id
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
    v_locator.turn_state_id
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


  /*
   * Stable identity only.
   *
   * The mutable singleton turn_number is intentionally not
   * compared here because a completed retry for execution N
   * may observe current turn N+1.
   */
  IF v_execution.combat_state_id <>
       v_combat.id
     OR v_execution.turn_state_id <>
       v_turn.id
     OR v_execution.match_runtime_id <>
       v_combat.match_runtime_id
     OR v_execution.match_id <>
       v_combat.match_id
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


  /*
   * World identity is immutable and one-to-one with combat.
   * No row lock is required.
   */
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


  /*
   * Idempotent completed retry.
   */
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

    IF v_existing.execution_id <>
         v_execution.id
       OR v_existing.shot_command_id <>
         v_execution.shot_command_id
       OR v_existing.combat_state_id <>
         v_execution.combat_state_id
       OR v_existing.combat_world_state_id <>
         v_world.id
       OR v_existing.turn_state_id <>
         v_execution.turn_state_id
       OR v_existing.match_runtime_id <>
         v_execution.match_runtime_id
       OR v_existing.match_id <>
         v_execution.match_id
       OR v_existing.turn_number <>
         v_execution.turn_number
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_RETRY_IDENTITY_CONFLICT';
    END IF;

    IF v_existing.physics_version
         IS DISTINCT FROM
           p_physics_version

       OR v_existing.outcome
         IS DISTINCT FROM
           p_outcome

       OR v_existing.impact_exact_version
         IS DISTINCT FROM
           p_impact_exact_version

       OR v_existing.impact_physics_fixed_scale
         IS DISTINCT FROM
           p_impact_physics_fixed_scale

       OR v_existing.impact_start_x_scaled
         IS DISTINCT FROM
           p_impact_start_x_scaled

       OR v_existing.impact_start_y_scaled
         IS DISTINCT FROM
           p_impact_start_y_scaled

       OR v_existing.impact_delta_x_scaled
         IS DISTINCT FROM
           p_impact_delta_x_scaled

       OR v_existing.impact_delta_y_scaled
         IS DISTINCT FROM
           p_impact_delta_y_scaled

       OR v_existing.impact_contact_kind
         IS DISTINCT FROM
           p_impact_contact_kind

       OR v_existing.impact_contact_numerator
         IS DISTINCT FROM
           p_impact_contact_numerator

       OR v_existing.impact_contact_denominator
         IS DISTINCT FROM
           p_impact_contact_denominator

       OR v_existing.impact_contact_a
         IS DISTINCT FROM
           p_impact_contact_a

       OR v_existing.impact_contact_b
         IS DISTINCT FROM
           p_impact_contact_b

       OR v_existing.impact_contact_discriminant
         IS DISTINCT FROM
           p_impact_contact_discriminant

       OR v_existing.impact_projection_version
         IS DISTINCT FROM
           p_impact_projection_version

       OR v_existing.impact_x
         IS DISTINCT FROM
           p_impact_x

       OR v_existing.impact_y
         IS DISTINCT FROM
           p_impact_y

       OR v_existing.target_account_id
         IS DISTINCT FROM
           p_target_account_id

       OR v_existing.damage
         IS DISTINCT FROM
           p_damage
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_RETRY_CONTENT_CONFLICT';
    END IF;

    RETURN v_existing;
  END IF;


  /*
   * Fresh commit path only.
   */
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


  IF v_turn.turn_number <>
       v_execution.turn_number
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_TURN_NUMBER_CONFLICT';
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


  IF v_combat.status <>
       'initialized'
     OR v_turn.status <>
       'active'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_GAMEPLAY_STATE_INVALID';
  END IF;


  /*
   * Immutable accepted command authority.
   */
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


  IF v_turn.active_account_id <>
       v_command.shooter_account_id
     OR v_turn.active_session_id <>
       v_command.shooter_session_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_SHOOTER_AUTHORITY_CONFLICT';
  END IF;


  /*
   * Immutable Rules V2 / Physics V1 authority.
   */
  IF v_combat.rules_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.rules_snapshot
        ) <> 'object'
     OR public.cing_artillery_validate_physics_rules_v2(
          v_combat.rules_snapshot
        )
        IS NOT TRUE
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_RULES_INVALID';
  END IF;

  BEGIN
    v_rules_version :=
      (
        v_combat.rules_snapshot ->>
          'version'
      )::integer;

    v_rules_physics_version :=
      (
        v_combat.rules_snapshot ->>
          'physics_version'
      )::integer;

    v_rules_physics_fixed_scale :=
      (
        v_combat.rules_snapshot ->>
          'physics_fixed_scale'
      )::bigint;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_RULES_INVALID';
  END;

  IF v_rules_version <> 2
     OR v_rules_physics_version <>
        p_physics_version
     OR v_rules_physics_fixed_scale <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_PHYSICS_AUTHORITY_CONFLICT';
  END IF;


  /*
   * Public Rules V2 validation already owns exact collision
   * numeric representability for projectile radius, player
   * radius and player center offset.
   */
  BEGIN
    v_rules_projectile_radius_scaled :=
      (
        (
          v_combat.rules_snapshot ->>
            'projectile_radius_px'
        )::numeric
        *
        v_rules_physics_fixed_scale::numeric
      )::bigint;

    v_rules_player_hit_radius_scaled :=
      (
        (
          v_combat.rules_snapshot ->>
            'player_hit_radius_px'
        )::numeric
        *
        v_rules_physics_fixed_scale::numeric
      )::bigint;

    v_rules_player_hit_center_offset_y_scaled :=
      (
        (
          v_combat.rules_snapshot ->>
            'player_hit_center_offset_y_px'
        )::numeric
        *
        v_rules_physics_fixed_scale::numeric
      )::bigint;

    v_rules_blast_radius_scaled :=
      public.cing_artillery_blast_radius_scaled_private_v1(
        v_combat.rules_snapshot
      );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_GEOMETRY_RULES_INVALID';
  END;


  IF v_rules_projectile_radius_scaled <= 0
     OR v_rules_player_hit_radius_scaled <= 0
     OR v_rules_player_hit_center_offset_y_scaled <= 0
     OR v_rules_blast_radius_scaled <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_GEOMETRY_RULES_INVALID';
  END IF;


  IF v_combat.damage_rules_rational_snapshot IS NULL
     OR public.cing_artillery_validate_damage_rules_rational_snapshot_private_v1(
          v_combat.damage_rules_rational_snapshot
        )
        IS NOT TRUE
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_DAMAGE_RULES_INVALID';
  END IF;


  /*
   * Map geometry is versioned immutable combat authority.
   *
   * enabled is intentionally NOT required here: disabling a map
   * prevents new matches but must not invalidate a match that
   * already owns this map_id.
   */
  SELECT m.*
  INTO v_map
  FROM public.cing_artillery_maps AS m
  WHERE m.id =
    v_world.map_id;

  IF NOT FOUND
     OR v_map.collision_format <>
        'bitmask_v1'
     OR public.cing_artillery_validate_collision_bitmask_v1(
          v_map.width_px,
          v_map.height_px,
          v_map.collision_mask
        )
        IS NOT TRUE
     OR v_map.collision_mask_sha256 !~
        '^[0-9a-f]{64}$'
     OR v_map.collision_mask_sha256 <>
        encode(
          extensions.digest(
            v_map.collision_mask,
            'sha256'
          ),
          'hex'
        )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_MAP_AUTHORITY_INVALID';
  END IF;



  /*
   * Mutable combat-world authority.
   *
   * Resolution settlement requires pre-existing mutable
   * terrain and player-world state. It never lazy-initializes
   * authority after combat -> turn -> execution locks exist.
   */

  SELECT t.*
  INTO v_terrain
  FROM public.cing_artillery_combat_terrain_states AS t
  WHERE t.combat_state_id = v_combat.id
  FOR UPDATE;

  IF NOT FOUND
     OR v_terrain.match_runtime_id <>
        v_combat.match_runtime_id
     OR v_terrain.match_id <>
        v_combat.match_id
     OR v_terrain.map_id <>
        v_map.id
     OR v_terrain.width_px <>
        v_map.width_px
     OR v_terrain.height_px <>
        v_map.height_px
     OR v_terrain.terrain_revision < 0
     OR public.cing_artillery_validate_collision_bitmask_v1(
          v_terrain.width_px,
          v_terrain.height_px,
          v_terrain.collision_mask
        )
        IS NOT TRUE
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_TERRAIN_AUTHORITY_INVALID';
  END IF;

  /*
   * Mutable execution snapshot fence.
   * The live claim must settle against the exact terrain
   * revision used for deterministic projectile computation.
   */
  IF v_execution.expected_terrain_revision IS NULL
     OR v_execution.expected_terrain_revision_claim_token
          IS DISTINCT FROM p_claim_token
     OR v_execution.expected_terrain_revision
          <> v_terrain.terrain_revision
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_SHOT_EXECUTION_TERRAIN_REVISION_STALE'
      USING ERRCODE = '40001';
  END IF;



  SELECT p.*
  INTO v_player_one_world
  FROM public.cing_artillery_player_world_states AS p
  WHERE p.combat_state_id = v_combat.id
    AND p.participant_slot = 1
  FOR UPDATE;

  IF NOT FOUND
     OR v_player_one_world.match_runtime_id <>
        v_combat.match_runtime_id
     OR v_player_one_world.match_id <>
        v_combat.match_id
     OR v_player_one_world.gameplay_session_id <>
        v_combat.player_one_gameplay_session_id
     OR v_player_one_world.account_id <>
        v_combat.player_one_account_id
     OR v_player_one_world.motion_state <> 'stable'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_PLAYER_ONE_WORLD_INVALID';
  END IF;


  SELECT p.*
  INTO v_player_two_world
  FROM public.cing_artillery_player_world_states AS p
  WHERE p.combat_state_id = v_combat.id
    AND p.participant_slot = 2
  FOR UPDATE;

  IF NOT FOUND
     OR v_player_two_world.match_runtime_id <>
        v_combat.match_runtime_id
     OR v_player_two_world.match_id <>
        v_combat.match_id
     OR v_player_two_world.gameplay_session_id <>
        v_combat.player_two_gameplay_session_id
     OR v_player_two_world.account_id <>
        v_combat.player_two_account_id
     OR v_player_two_world.motion_state <> 'stable'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_PLAYER_TWO_WORLD_INVALID';
  END IF;

  /*
   * Exact-impact / projection durable shape.
   */
  IF p_outcome IN (
       'player_hit',
       'terrain_hit'
     )
  THEN
    IF p_impact_exact_version IS DISTINCT FROM 1
       OR p_impact_physics_fixed_scale IS NULL
       OR p_impact_physics_fixed_scale <>
          v_rules_physics_fixed_scale
       OR p_impact_start_x_scaled IS NULL
       OR p_impact_start_y_scaled IS NULL
       OR p_impact_delta_x_scaled IS NULL
       OR p_impact_delta_y_scaled IS NULL
       OR p_impact_projection_version IS DISTINCT FROM 1
       OR p_impact_x IS NULL
       OR p_impact_y IS NULL
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_IMPACT_AUTHORITY_INVALID';
    END IF;

    IF p_impact_x IN (
         'NaN'::numeric,
         'Infinity'::numeric,
         '-Infinity'::numeric
       )
       OR p_impact_y IN (
         'NaN'::numeric,
         'Infinity'::numeric,
         '-Infinity'::numeric
       )
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_IMPACT_PROJECTION_INVALID';
    END IF;

    IF p_impact_contact_kind =
         'rational'
    THEN
      IF p_impact_contact_numerator IS NULL
         OR p_impact_contact_denominator IS NULL
         OR p_impact_contact_denominator <= 0
         OR p_impact_contact_numerator <>
            trunc(
              p_impact_contact_numerator
            )
         OR p_impact_contact_denominator <>
            trunc(
              p_impact_contact_denominator
            )
         OR p_impact_contact_a IS NOT NULL
         OR p_impact_contact_b IS NOT NULL
         OR p_impact_contact_discriminant IS NOT NULL
      THEN
        RAISE EXCEPTION
          USING
            ERRCODE = 'P0001',
            MESSAGE =
              'CING_ARTILLERY_RESOLUTION_CONTACT_PARAMETER_INVALID';
      END IF;

    ELSIF p_impact_contact_kind =
            'quadratic_lower_root'
    THEN
      IF p_impact_contact_numerator IS NOT NULL
         OR p_impact_contact_denominator IS NOT NULL
         OR p_impact_contact_a IS NULL
         OR p_impact_contact_a <= 0
         OR p_impact_contact_a <>
            trunc(
              p_impact_contact_a
            )
         OR p_impact_contact_b IS NULL
         OR p_impact_contact_b <>
            trunc(
              p_impact_contact_b
            )
         OR p_impact_contact_discriminant IS NULL
         OR p_impact_contact_discriminant < 0
         OR p_impact_contact_discriminant <>
            trunc(
              p_impact_contact_discriminant
            )
      THEN
        RAISE EXCEPTION
          USING
            ERRCODE = 'P0001',
            MESSAGE =
              'CING_ARTILLERY_RESOLUTION_CONTACT_PARAMETER_INVALID';
      END IF;

    ELSE
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_CONTACT_PARAMETER_INVALID';
    END IF;


    IF public.cing_artillery_validate_contact_parameter_private_v1(
         p_impact_contact_kind,
         p_impact_contact_numerator,
         p_impact_contact_denominator,
         p_impact_contact_a,
         p_impact_contact_b,
         p_impact_contact_discriminant
       )
       IS NOT TRUE
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_CONTACT_PARAMETER_NOT_CANONICAL';
    END IF;


    IF public.cing_artillery_validate_impact_numeric_projection_private_v1(
         p_impact_projection_version,
         p_impact_physics_fixed_scale,

         p_impact_start_x_scaled,
         p_impact_start_y_scaled,
         p_impact_delta_x_scaled,
         p_impact_delta_y_scaled,

         p_impact_contact_kind,
         p_impact_contact_numerator,
         p_impact_contact_denominator,
         p_impact_contact_a,
         p_impact_contact_b,
         p_impact_contact_discriminant,

         p_impact_x,
         p_impact_y
       )
       IS NOT TRUE
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_IMPACT_PROJECTION_NOT_CANONICAL';
    END IF;


    IF p_impact_contact_kind =
         'rational'
    THEN
      v_caller_contact :=
        public.cing_artillery_make_contact_rational_private_v1(
          p_impact_contact_numerator,
          p_impact_contact_denominator
        );

    ELSIF p_impact_contact_kind =
            'quadratic_lower_root'
    THEN
      v_caller_contact :=
        public.cing_artillery_make_contact_quadratic_private_v1(
          p_impact_contact_a,
          p_impact_contact_b,
          p_impact_contact_discriminant
        );

    ELSE
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_CONTACT_PARAMETER_INVALID';
    END IF;

  ELSE
    IF p_impact_exact_version IS NOT NULL
       OR p_impact_physics_fixed_scale IS NOT NULL
       OR p_impact_start_x_scaled IS NOT NULL
       OR p_impact_start_y_scaled IS NOT NULL
       OR p_impact_delta_x_scaled IS NOT NULL
       OR p_impact_delta_y_scaled IS NOT NULL
       OR p_impact_contact_kind IS NOT NULL
       OR p_impact_contact_numerator IS NOT NULL
       OR p_impact_contact_denominator IS NOT NULL
       OR p_impact_contact_a IS NOT NULL
       OR p_impact_contact_b IS NOT NULL
       OR p_impact_contact_discriminant IS NOT NULL
       OR p_impact_projection_version IS NOT NULL
       OR p_impact_x IS NOT NULL
       OR p_impact_y IS NOT NULL
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_NO_IMPACT_SHAPE_INVALID';
    END IF;
  END IF;


  /*
   * =====================================================
   * CANONICAL FRESH RESOLUTION AUTHORITY
   * =====================================================
   *
   * Caller target/damage are proof-only.
   *
   * PostgreSQL derives:
   *
   *   opponent identity
   *   immutable ATK / DEF
   *   canonical opponent center
   *   player/terrain segment event
   *   blast eligibility + exact distance
   *   canonical damage
   */


  BEGIN
    IF v_turn.active_account_id =
         v_combat.player_one_account_id
       AND v_turn.active_session_id =
         v_combat.player_one_session_id
    THEN
      v_expected_target_account_id :=
        v_combat.player_two_account_id;

      v_attacker_attack :=
        (
          v_combat.player_one_stats_snapshot ->>
            'attack'
        )::integer;

      v_defender_defense :=
        (
          v_combat.player_two_stats_snapshot ->>
            'defense'
        )::integer;

      v_opponent_center_x_scaled :=
        v_player_two_world.position_x::bigint *
        v_rules_physics_fixed_scale;

      v_opponent_center_y_scaled :=
        (
          v_player_two_world.position_y::bigint *
          v_rules_physics_fixed_scale
        )
        -
        v_rules_player_hit_center_offset_y_scaled;


    ELSIF v_turn.active_account_id =
            v_combat.player_two_account_id
          AND v_turn.active_session_id =
            v_combat.player_two_session_id
    THEN
      v_expected_target_account_id :=
        v_combat.player_one_account_id;

      v_attacker_attack :=
        (
          v_combat.player_two_stats_snapshot ->>
            'attack'
        )::integer;

      v_defender_defense :=
        (
          v_combat.player_one_stats_snapshot ->>
            'defense'
        )::integer;

      v_opponent_center_x_scaled :=
        v_player_one_world.position_x::bigint *
        v_rules_physics_fixed_scale;

      v_opponent_center_y_scaled :=
        (
          v_player_one_world.position_y::bigint *
          v_rules_physics_fixed_scale
        )
        -
        v_rules_player_hit_center_offset_y_scaled;


    ELSE
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_ACTIVE_PARTICIPANT_INVALID';
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_DAMAGE_STAT_BINDING_INVALID';
  END;


  IF v_expected_target_account_id IS NULL
     OR v_attacker_attack <= 0
     OR v_defender_defense <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_DAMAGE_STAT_BINDING_INVALID';
  END IF;


  v_canonical_target_account_id :=
    NULL;

  v_canonical_damage :=
    0;

  v_blast_distance_floor_scaled :=
    NULL;


  /*
   * Only collision outcomes carry durable exact terminal
   * segment/contact fields under the current Resolution V1
   * contract.
   *
   * Therefore Segment Event parity is enforced for every
   * HP-capable outcome.
   */
  IF p_outcome IN (
       'player_hit',
       'terrain_hit'
     )
  THEN
    v_segment_event :=
      public.cing_artillery_classify_segment_event_private_v1(
        p_impact_start_x_scaled,
        p_impact_start_y_scaled,

        p_impact_start_x_scaled +
          p_impact_delta_x_scaled,

        p_impact_start_y_scaled +
          p_impact_delta_y_scaled,

        v_rules_projectile_radius_scaled,

        v_opponent_center_x_scaled,
        v_opponent_center_y_scaled,
        v_rules_player_hit_radius_scaled,

        v_rules_physics_fixed_scale,

        v_terrain.width_px,
        v_terrain.height_px,
        v_terrain.collision_mask
      );


    IF v_segment_event IS NULL
       OR (
         v_segment_event ->>
           'segment_event_kind'
       ) <>
          'collision'
       OR (
         v_segment_event ->
           'contact_parameter'
       ) IS DISTINCT FROM
          v_caller_contact
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_SEGMENT_EVENT_CONFLICT';
    END IF;


    IF p_outcome =
         'player_hit'
       AND (
         v_segment_event ->>
           'collision_kind'
       ) <>
          'player'
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_PLAYER_EVENT_CONFLICT';
    END IF;


    IF p_outcome =
         'terrain_hit'
       AND (
         v_segment_event ->>
           'collision_kind'
       ) <>
          'terrain'
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_TERRAIN_EVENT_CONFLICT';
    END IF;
  END IF;


  IF p_outcome =
       'player_hit'
  THEN
    v_canonical_target_account_id :=
      v_expected_target_account_id;

    v_canonical_damage :=
      public.cing_artillery_calculate_canonical_damage_private_v1(
        v_combat.damage_rules_rational_snapshot,
        v_attacker_attack,
        v_defender_defense,
        'direct',
        NULL,
        NULL
      );


  ELSIF p_outcome =
          'terrain_hit'
  THEN
    v_blast_relation :=
      public.cing_artillery_classify_affine_point_circle_private_v1(
        p_impact_start_x_scaled,
        p_impact_start_y_scaled,
        p_impact_delta_x_scaled,
        p_impact_delta_y_scaled,

        p_impact_contact_kind,
        p_impact_contact_numerator,
        p_impact_contact_denominator,
        p_impact_contact_a,
        p_impact_contact_b,
        p_impact_contact_discriminant,

        v_opponent_center_x_scaled,
        v_opponent_center_y_scaled,
        v_rules_blast_radius_scaled
      );


    IF v_blast_relation IN (
         'inside',
         'tangent'
       )
    THEN
      v_blast_distance_floor_scaled :=
        public.cing_artillery_exact_blast_distance_floor_private_v1(
          p_impact_start_x_scaled,
          p_impact_start_y_scaled,
          p_impact_delta_x_scaled,
          p_impact_delta_y_scaled,

          p_impact_contact_kind,
          p_impact_contact_numerator,
          p_impact_contact_denominator,
          p_impact_contact_a,
          p_impact_contact_b,
          p_impact_contact_discriminant,

          v_opponent_center_x_scaled,
          v_opponent_center_y_scaled,
          v_rules_blast_radius_scaled
        );


      v_canonical_target_account_id :=
        v_expected_target_account_id;

      v_canonical_damage :=
        public.cing_artillery_calculate_canonical_damage_private_v1(
          v_combat.damage_rules_rational_snapshot,
          v_attacker_attack,
          v_defender_defense,
          'blast',
          v_rules_blast_radius_scaled,
          v_blast_distance_floor_scaled
        );


    ELSIF v_blast_relation =
            'outside'
    THEN
      v_canonical_target_account_id :=
        NULL;

      v_canonical_damage :=
        0;


    ELSE
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_BLAST_GEOMETRY_INVALID';
    END IF;


  ELSIF p_outcome IN (
          'out_of_bounds',
          'flight_horizon_exhausted'
        )
  THEN
    v_canonical_target_account_id :=
      NULL;

    v_canonical_damage :=
      0;


  ELSE
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_OUTCOME_AUTHORITY_INVALID';
  END IF;


  IF v_canonical_damage IS NULL
     OR v_canonical_damage IN (
          'NaN'::numeric,
          'Infinity'::numeric,
          '-Infinity'::numeric
        )
     OR v_canonical_damage < 0
     OR trunc(v_canonical_damage) <>
        v_canonical_damage
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_CANONICAL_DAMAGE_INVALID';
  END IF;


  /*
   * Fresh caller materialization is now equality proof only.
   */
  IF p_target_account_id IS DISTINCT FROM
       v_canonical_target_account_id
     OR p_damage IS DISTINCT FROM
       v_canonical_damage
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_CANONICAL_PAYLOAD_CONFLICT';
  END IF;


  /*
   * Vital is the fourth mutable gameplay lock.
   */
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


  /*
   * A fresh ACTIVE combat may not already contain depleted HP.
   */
  IF v_vital.player_one_current_hp <= 0
     OR v_vital.player_two_current_hp <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_PRE_DAMAGE_HP_INVALID';
  END IF;


  /*
   * Durable immutable resolution first.
   * Any subsequent failure rolls the entire transaction back.
   */
  INSERT INTO
    public.cing_artillery_shot_resolutions (
      id,
      execution_id,
      shot_command_id,
      combat_state_id,
      combat_world_state_id,
      turn_state_id,
      match_runtime_id,
      match_id,
      turn_number,
      physics_version,
      outcome,
      impact_exact_version,
      impact_physics_fixed_scale,
      impact_start_x_scaled,
      impact_start_y_scaled,
      impact_delta_x_scaled,
      impact_delta_y_scaled,
      impact_contact_kind,
      impact_contact_numerator,
      impact_contact_denominator,
      impact_contact_a,
      impact_contact_b,
      impact_contact_discriminant,
      impact_projection_version,
      impact_x,
      impact_y,
      target_account_id,
      damage,
      resolved_at,
      created_at
    )
  VALUES (
      gen_random_uuid(),
      v_execution.id,
      v_execution.shot_command_id,
      v_combat.id,
      v_world.id,
      v_turn.id,
      v_combat.match_runtime_id,
      v_combat.match_id,
      v_execution.turn_number,
      p_physics_version,
      p_outcome,
      p_impact_exact_version,
      p_impact_physics_fixed_scale,
      p_impact_start_x_scaled,
      p_impact_start_y_scaled,
      p_impact_delta_x_scaled,
      p_impact_delta_y_scaled,
      p_impact_contact_kind,
      p_impact_contact_numerator,
      p_impact_contact_denominator,
      p_impact_contact_a,
      p_impact_contact_b,
      p_impact_contact_discriminant,
      p_impact_projection_version,
      p_impact_x,
      p_impact_y,
      v_canonical_target_account_id,
      v_canonical_damage,
      v_now,
      v_now
    )
  RETURNING *
  INTO v_resolution;


  /*
   * Damage mutates exactly one server-derived opponent HP.
   * Zero-damage outcomes do not touch Combat Vital.
   */
  IF v_canonical_damage > 0 THEN
    IF v_canonical_target_account_id =
         v_vital.player_one_account_id
    THEN
      UPDATE public.cing_artillery_combat_vital_states
      SET
        player_one_current_hp =
          GREATEST(
            0::numeric,
            player_one_current_hp -
              v_canonical_damage
          ),
        updated_at =
          v_now
      WHERE id =
        v_vital.id
      RETURNING *
      INTO v_vital;

      v_target_post_hp :=
        v_vital.player_one_current_hp;

    ELSIF v_canonical_target_account_id =
            v_vital.player_two_account_id
    THEN
      UPDATE public.cing_artillery_combat_vital_states
      SET
        player_two_current_hp =
          GREATEST(
            0::numeric,
            player_two_current_hp -
              v_canonical_damage
          ),
        updated_at =
          v_now
      WHERE id =
        v_vital.id
      RETURNING *
      INTO v_vital;

      v_target_post_hp :=
        v_vital.player_two_current_hp;

    ELSE
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_VITAL_TARGET_INVALID';
    END IF;

    IF v_target_post_hp IS NULL
       OR v_target_post_hp < 0
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_RESOLUTION_POST_DAMAGE_HP_INVALID';
    END IF;
  END IF;


  /*
   * Execution completion is now internal to this transaction.
   * claim_token remains retained.
   */
  UPDATE public.cing_artillery_shot_executions
  SET
    status =
      'completed',
    locked_until =
      NULL,
    last_error =
      NULL,
    completed_at =
      v_now,
    updated_at =
      v_now
  WHERE id =
      v_execution.id
    AND status =
      'processing'
    AND claim_token =
      p_claim_token
    AND locked_until IS NOT NULL
    AND locked_until >
      v_now
  RETURNING *
  INTO v_execution;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESOLUTION_EXECUTION_COMPLETION_CONFLICT';
  END IF;


  /*
   * Exactly one lifecycle branch.
   */

  IF v_canonical_damage > 0
     AND v_target_post_hp = 0
  THEN
    /*
     * HP terminal always wins.
     * Terrain aftermath must never override hp_depleted.
     */
    PERFORM public.cing_artillery_complete_combat_private(
      v_combat.id,
      v_turn.id,
      v_resolution.turn_number
    );

    RETURN v_resolution;
  END IF;


  IF v_resolution.outcome = 'terrain_hit'
  THEN
    v_crater_result :=
      public.cing_artillery_apply_terrain_crater_private_v1(
        v_combat.id,
        v_resolution.id
      );

    /*
     * Settlement order V1 is explicit gameplay authority:
     * participant slot 1, then participant slot 2.
     */

    v_support_result :=
      public.cing_artillery_resolve_player_support_private_v1(
        v_combat.id,
        v_turn.id,
        v_resolution.turn_number,
        v_combat.player_one_account_id
      );

    IF COALESCE(
         v_support_result ->> 'outcome',
         ''
       ) = 'fell_out_of_world'
    THEN
      RETURN v_resolution;
    END IF;


    v_support_result :=
      public.cing_artillery_resolve_player_support_private_v1(
        v_combat.id,
        v_turn.id,
        v_resolution.turn_number,
        v_combat.player_two_account_id
      );

    IF COALESCE(
         v_support_result ->> 'outcome',
         ''
       ) = 'fell_out_of_world'
    THEN
      RETURN v_resolution;
    END IF;
  END IF;


  PERFORM public.cing_artillery_advance_turn_private(
    v_combat.id,
    v_turn.id,
    v_resolution.turn_number
  );


  RETURN v_resolution;

END;
$$;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_commit_resolution_fenced_atomic(
    uuid,
    uuid,
    integer,
    text,
    integer,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
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
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_commit_resolution_fenced_atomic(
    uuid,
    uuid,
    integer,
    text,
    integer,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
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
TO service_role;

COMMIT;
