BEGIN;

/*
 * =====================================================
 * CING PIU PIU / CING ARTILLERY
 * PLAYER SUPPORT EXACT TURN FENCE V2
 * =====================================================
 *
 * Root cause:
 *
 * V1 accepted turn_state_id and expected_turn_number but only
 * delegated them to the terminal fall primitive. The supported
 * and landed branches could therefore mutate player world state
 * without independently proving the exact canonical live turn.
 *
 * V2 makes the support resolver self-authoritative:
 *
 *   combat lock
 *     -> turn lock
 *     -> exact combat/turn identity
 *     -> exact live-turn fence
 *     -> terrain/player support settlement
 *
 * It also makes the downward scan explicitly bottom-safe.
 * =====================================================
 */

CREATE OR REPLACE FUNCTION
  public.cing_artillery_resolve_player_support_private_v1(
    p_combat_state_id uuid,
    p_turn_state_id uuid,
    p_expected_turn_number integer,
    p_account_id uuid
  )
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_turn
    public.cing_artillery_turn_states%ROWTYPE;

  v_terrain
    public.cing_artillery_combat_terrain_states%ROWTYPE;

  v_player
    public.cing_artillery_player_world_states%ROWTYPE;

  v_hit_radius numeric;

  v_scan_y integer;

  v_landing_y integer;

  v_supported boolean;

  v_now timestamptz;

  v_start_y integer;
BEGIN
  IF p_combat_state_id IS NULL
     OR p_turn_state_id IS NULL
     OR p_expected_turn_number IS NULL
     OR p_expected_turn_number <= 0
     OR p_account_id IS NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_SUPPORT_ARGUMENT_REQUIRED';
  END IF;


  -- Combat row is the serialization boundary shared by
  -- terrain mutation and player support resolution.
  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.id = p_combat_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_FOUND';
  END IF;

  IF v_combat.status <> 'initialized' THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_SUPPORT_COMBAT_NOT_ACTIVE';
  END IF;


  /*
   * Canonical exact-turn fence.
   *
   * Support resolution can mutate player world state even when
   * the player remains supported or lands successfully. Therefore
   * every outcome, not only terminal fall, must prove ownership of
   * the exact live turn before reading/mutating support state.
   *
   * Lock order remains:
   *
   *   combat -> turn
   *
   * matching the canonical gameplay authority hierarchy.
   */
  SELECT t.*
  INTO v_turn
  FROM public.cing_artillery_turn_states AS t
  WHERE t.id = p_turn_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_SUPPORT_TURN_STATE_NOT_FOUND';
  END IF;


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
          'CING_ARTILLERY_PLAYER_SUPPORT_TURN_CHAIN_INCONSISTENT';
  END IF;


  IF v_turn.status <> 'active'
     OR v_turn.turn_number <>
          p_expected_turn_number
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
          'CING_ARTILLERY_PLAYER_SUPPORT_TURN_STATE_CONFLICT';
  END IF;


  IF p_account_id <>
       v_combat.player_one_account_id
     AND p_account_id <>
       v_combat.player_two_account_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_SUPPORT_ACCOUNT_INVALID';
  END IF;


  IF v_combat.rules_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.rules_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.rules_snapshot ->
            'player_hit_radius_px'
        ) <> 'number'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_SUPPORT_RULES_INVALID';
  END IF;


  v_hit_radius :=
    (
      v_combat.rules_snapshot ->>
        'player_hit_radius_px'
    )::numeric;

  IF v_hit_radius <= 0
     OR v_hit_radius =
        'NaN'::numeric
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_SUPPORT_RULES_INVALID';
  END IF;


  SELECT t.*
  INTO v_terrain
  FROM public.cing_artillery_combat_terrain_states AS t
  WHERE t.combat_state_id =
    v_combat.id;

  IF NOT FOUND
     OR v_terrain.match_runtime_id <>
        v_combat.match_runtime_id
     OR v_terrain.match_id <>
        v_combat.match_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_SUPPORT_TERRAIN_MISSING';
  END IF;


  SELECT p.*
  INTO v_player
  FROM public.cing_artillery_player_world_states AS p
  WHERE p.combat_state_id =
    v_combat.id
    AND p.account_id =
      p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_WORLD_STATE_MISSING';
  END IF;


  v_start_y :=
    v_player.position_y;


  v_supported :=
    public.cing_artillery_player_supported_private_v1(
      v_terrain.width_px,
      v_terrain.height_px,
      v_terrain.collision_mask,
      v_player.position_x,
      v_player.position_y,
      v_hit_radius
    );


  IF v_supported THEN
    IF v_player.motion_state <> 'stable' THEN
      v_now := clock_timestamp();

      UPDATE
        public.cing_artillery_player_world_states
      SET
        motion_state = 'stable',
        updated_at = v_now
      WHERE id = v_player.id;
    END IF;

    RETURN jsonb_build_object(
      'account_id',
      p_account_id,
      'outcome',
      'supported',
      'start_y',
      v_start_y,
      'end_y',
      v_start_y,
      'fall_distance_px',
      0,
      'terrain_revision',
      v_terrain.terrain_revision
    );
  END IF;


  v_landing_y :=
    NULL;

  /*
   * Scan only when at least one canonical in-world row remains
   * below the current ground-contact coordinate.
   *
   * This avoids relying on PL/pgSQL integer-range reversal
   * semantics at or below the world bottom.
   */
  IF v_player.position_y <
       (v_terrain.height_px - 1)
  THEN
    FOR v_scan_y IN
      (v_player.position_y + 1)
      ..
      (v_terrain.height_px - 1)
    LOOP
      IF
        public.cing_artillery_player_supported_private_v1(
          v_terrain.width_px,
          v_terrain.height_px,
          v_terrain.collision_mask,
          v_player.position_x,
          v_scan_y,
          v_hit_radius
        )
      THEN
        v_landing_y :=
          v_scan_y;

        EXIT;
      END IF;
    END LOOP;
  END IF;


  IF v_landing_y IS NOT NULL THEN
    v_now := clock_timestamp();

    UPDATE
      public.cing_artillery_player_world_states
    SET
      position_y = v_landing_y,
      motion_state = 'stable',
      updated_at = v_now
    WHERE id = v_player.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_PLAYER_WORLD_UPDATE_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'account_id',
      p_account_id,
      'outcome',
      'landed',
      'start_y',
      v_start_y,
      'end_y',
      v_landing_y,
      'fall_distance_px',
      v_landing_y - v_start_y,
      'terrain_revision',
      v_terrain.terrain_revision
    );
  END IF;


  -- No support exists before the canonical map bottom.
  --
  -- Terminal lifecycle is delegated exclusively to the
  -- dedicated fell_out_of_world primitive.

  PERFORM
    public.cing_artillery_complete_fell_out_of_world_private(
      p_combat_state_id,
      p_turn_state_id,
      p_expected_turn_number,
      p_account_id
    );


  v_now := clock_timestamp();

  UPDATE
    public.cing_artillery_player_world_states
  SET
    position_y = v_terrain.height_px,
    motion_state = 'falling',
    updated_at = v_now
  WHERE id = v_player.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_WORLD_UPDATE_CONFLICT';
  END IF;


  RETURN jsonb_build_object(
    'account_id',
    p_account_id,
    'outcome',
    'fell_out_of_world',
    'start_y',
    v_start_y,
    'end_y',
    v_terrain.height_px,
    'fall_distance_px',
    v_terrain.height_px - v_start_y,
    'terrain_revision',
    v_terrain.terrain_revision
  );
END;
$$;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_resolve_player_support_private_v1(
    uuid,
    uuid,
    integer,
    uuid
  )
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
