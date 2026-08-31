BEGIN;

ALTER TABLE public.cing_artillery_shot_executions
  ADD COLUMN IF NOT EXISTS expected_terrain_revision bigint;

ALTER TABLE public.cing_artillery_shot_executions
  DROP CONSTRAINT IF EXISTS cing_artillery_shot_executions_expected_terrain_revision_ck;

ALTER TABLE public.cing_artillery_shot_executions
  ADD CONSTRAINT cing_artillery_shot_executions_expected_terrain_revision_ck
  CHECK (
    expected_terrain_revision IS NULL
    OR expected_terrain_revision >= 0
  );

COMMENT ON COLUMN
  public.cing_artillery_shot_executions.expected_terrain_revision
IS
  'Canonical mutable-terrain revision bound to the live execution claim before deterministic projectile computation. Settlement must reject a different revision.';

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

  IF v_execution.expected_terrain_revision IS NULL THEN
    UPDATE public.cing_artillery_shot_executions
    SET expected_terrain_revision = v_terrain.terrain_revision
    WHERE id = v_execution.id
      AND status = 'processing'
      AND claim_token = p_claim_token
      AND expected_terrain_revision IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'CING_ARTILLERY_EXECUTION_CONTEXT_REVISION_BIND_FAILED'
        USING ERRCODE = '40001';
    END IF;

    v_execution.expected_terrain_revision :=
      v_terrain.terrain_revision;
  ELSIF v_execution.expected_terrain_revision
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

COMMIT;
