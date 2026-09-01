BEGIN;

CREATE OR REPLACE FUNCTION
  public.cing_artillery_read_mutable_terrain_authorized_v1(
    p_match_id uuid,
    p_match_runtime_id uuid,
    p_account_id uuid
  )
RETURNS TABLE (
  combat_state_id uuid,
  match_runtime_id uuid,
  match_id uuid,
  map_id uuid,
  width_px integer,
  height_px integer,
  terrain_revision text,
  collision_mask_hex text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_runtime
    public.cing_artillery_match_runtimes%ROWTYPE;

  v_terrain
    public.cing_artillery_combat_terrain_states%ROWTYPE;
BEGIN
  IF p_match_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_TERRAIN_READ_MATCH_ID_REQUIRED_V1';
  END IF;

  IF p_match_runtime_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_TERRAIN_READ_RUNTIME_ID_REQUIRED_V1';
  END IF;

  IF p_account_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_TERRAIN_READ_ACCOUNT_ID_REQUIRED_V1';
  END IF;

  SELECT
    r.*
  INTO
    v_runtime
  FROM
    public.cing_artillery_match_runtimes AS r
  WHERE
    r.id = p_match_runtime_id
    AND r.match_id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_TERRAIN_READ_RUNTIME_NOT_FOUND_V1';
  END IF;

  IF p_account_id IS DISTINCT FROM
       v_runtime.player_one_account_id
     AND
     p_account_id IS DISTINCT FROM
       v_runtime.player_two_account_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '42501',
        MESSAGE =
          'CING_ARTILLERY_TERRAIN_READ_ACCESS_DENIED_V1';
  END IF;

  SELECT
    t.*
  INTO
    v_terrain
  FROM
    public.cing_artillery_combat_terrain_states AS t
  WHERE
    t.match_runtime_id = p_match_runtime_id
    AND t.match_id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_TERRAIN_READ_NOT_FOUND_V1';
  END IF;

  IF v_terrain.combat_state_id IS NULL
     OR v_terrain.match_runtime_id IS DISTINCT FROM
          p_match_runtime_id
     OR v_terrain.match_id IS DISTINCT FROM
          p_match_id
     OR v_terrain.map_id IS NULL
     OR v_terrain.width_px IS NULL
     OR v_terrain.width_px <= 0
     OR v_terrain.height_px IS NULL
     OR v_terrain.height_px <= 0
     OR v_terrain.terrain_revision IS NULL
     OR v_terrain.terrain_revision < 0
     OR v_terrain.collision_mask IS NULL
     OR octet_length(v_terrain.collision_mask) = 0
     OR public.cing_artillery_validate_collision_bitmask_v1(
          v_terrain.width_px,
          v_terrain.height_px,
          v_terrain.collision_mask
        ) IS NOT TRUE
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '55000',
        MESSAGE =
          'CING_ARTILLERY_TERRAIN_READ_STATE_INVALID_V1';
  END IF;

  RETURN QUERY
  SELECT
    v_terrain.combat_state_id,
    v_terrain.match_runtime_id,
    v_terrain.match_id,
    v_terrain.map_id,
    v_terrain.width_px,
    v_terrain.height_px,
    v_terrain.terrain_revision::text,
    encode(
      v_terrain.collision_mask,
      'hex'
    );
END;
$$;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_read_mutable_terrain_authorized_v1(
    uuid,
    uuid,
    uuid
  )
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_read_mutable_terrain_authorized_v1(
    uuid,
    uuid,
    uuid
  )
TO service_role;

COMMIT;
