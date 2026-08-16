BEGIN;

-- =====================================================
-- CING ARTILLERY — MAP PUBLICATION AUTHORITY
--
-- Canonical map geometry semantics:
--
-- Coordinate space:
--   map-local integer pixel coordinates
--
-- Origin:
--   top-left
--
-- Axes:
--   +X = right
--   +Y = down
--
-- Collision BITMASK_V1:
--   1 = solid terrain
--   0 = empty space
--
-- Spawn coordinate:
--   ground-contact pixel of the character.
--
-- A canonical spawn surface pixel MUST:
--   be solid at (x, y)
--   and
--   be empty immediately above at (x, y - 1)
--   when y > 0.
--
-- Character body/collider clearance is intentionally NOT
-- part of map publication. That belongs to Combat World
-- authority once canonical character geometry exists.
--
-- Publication is atomic:
--   map version + complete spawn set
--
-- Newly published maps are always disabled.
-- Selection enablement belongs to a separate authority.
-- =====================================================


-- =====================================================
-- COLLISION PIXEL AUTHORITY
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_collision_bitmask_v1_is_solid(
    p_width_px integer,
    p_height_px integer,
    p_collision_mask bytea,
    p_x integer,
    p_y integer
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_bytes_per_row bigint;
  v_byte_offset bigint;
  v_bit_index integer;
  v_byte integer;
BEGIN
  IF NOT
    public.cing_artillery_validate_collision_bitmask_v1(
      p_width_px,
      p_height_px,
      p_collision_mask
    )
  THEN
    RETURN false;
  END IF;

  IF p_x < 0
     OR p_y < 0
     OR p_x >= p_width_px
     OR p_y >= p_height_px
  THEN
    RETURN false;
  END IF;

  v_bytes_per_row :=
    (
      p_width_px::bigint + 7
    ) / 8;

  v_byte_offset :=
    p_y::bigint * v_bytes_per_row
    + (p_x / 8);

  v_bit_index :=
    7 - (p_x % 8);

  v_byte :=
    get_byte(
      p_collision_mask,
      v_byte_offset::integer
    );

  RETURN
    (
      v_byte
      & (1 << v_bit_index)
    ) <> 0;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_collision_bitmask_v1_is_solid(
    integer,
    integer,
    bytea,
    integer,
    integer
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_collision_bitmask_v1_is_solid(
    integer,
    integer,
    bytea,
    integer,
    integer
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_collision_bitmask_v1_is_solid(
    integer,
    integer,
    bytea,
    integer,
    integer
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_collision_bitmask_v1_is_solid(
    integer,
    integer,
    bytea,
    integer,
    integer
  )
FROM service_role;


-- =====================================================
-- SPAWN SURFACE VALIDATOR
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_validate_map_spawn_surface_v1(
    p_width_px integer,
    p_height_px integer,
    p_collision_mask bytea,
    p_x integer,
    p_y integer
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_x < 0
     OR p_y < 0
     OR p_x >= p_width_px
     OR p_y >= p_height_px
  THEN
    RETURN false;
  END IF;

  IF NOT
    public.cing_artillery_collision_bitmask_v1_is_solid(
      p_width_px,
      p_height_px,
      p_collision_mask,
      p_x,
      p_y
    )
  THEN
    RETURN false;
  END IF;

  IF p_y > 0
     AND
     public.cing_artillery_collision_bitmask_v1_is_solid(
       p_width_px,
       p_height_px,
       p_collision_mask,
       p_x,
       p_y - 1
     )
  THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_map_spawn_surface_v1(
    integer,
    integer,
    bytea,
    integer,
    integer
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_map_spawn_surface_v1(
    integer,
    integer,
    bytea,
    integer,
    integer
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_map_spawn_surface_v1(
    integer,
    integer,
    bytea,
    integer,
    integer
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_map_spawn_surface_v1(
    integer,
    integer,
    bytea,
    integer,
    integer
  )
FROM service_role;


-- =====================================================
-- ATOMIC MAP PUBLICATION
--
-- p_spawn_pairs JSON:
--
-- [
--   {
--     "spawn_key": "...",
--     "side_a_x": 0,
--     "side_a_y": 0,
--     "side_b_x": 0,
--     "side_b_y": 0,
--     "enabled": true,
--     "selection_weight": 1
--   }
-- ]
--
-- No default/fallback spawn is synthesized.
-- Empty spawn sets are rejected.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_publish_map_version_atomic(
    p_map_key text,
    p_version integer,
    p_display_name text,
    p_width_px integer,
    p_height_px integer,
    p_collision_format text,
    p_collision_mask bytea,
    p_collision_mask_sha256 text,
    p_render_asset_key text,
    p_selection_weight integer,
    p_spawn_pairs jsonb
  )
RETURNS public.cing_artillery_maps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_map
    public.cing_artillery_maps%ROWTYPE;

  v_spawn jsonb;
  v_spawn_key text;
  v_side_a_x integer;
  v_side_a_y integer;
  v_side_b_x integer;
  v_side_b_y integer;
  v_enabled boolean;
  v_selection_weight integer;
  v_seen_spawn_keys text[] :=
    ARRAY[]::text[];
BEGIN
  IF p_map_key IS NULL
     OR p_map_key !~
       '^[a-z0-9][a-z0-9_-]{1,63}$'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_MAP_INVALID_KEY';
  END IF;

  IF p_version IS NULL
     OR p_version <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_MAP_INVALID_VERSION';
  END IF;

  IF p_display_name IS NULL
     OR btrim(p_display_name) = ''
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_MAP_DISPLAY_NAME_REQUIRED';
  END IF;

  IF p_width_px IS NULL
     OR p_height_px IS NULL
     OR p_width_px <= 0
     OR p_height_px <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_MAP_INVALID_DIMENSIONS';
  END IF;

  IF p_collision_format IS DISTINCT FROM
       'bitmask_v1'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_MAP_INVALID_COLLISION_FORMAT';
  END IF;

  IF p_collision_mask IS NULL
     OR NOT
       public.cing_artillery_validate_collision_bitmask_v1(
         p_width_px,
         p_height_px,
         p_collision_mask
       )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_MAP_INVALID_COLLISION_MASK';
  END IF;

  IF p_collision_mask_sha256 IS NULL
     OR p_collision_mask_sha256 !~
       '^[0-9a-f]{64}$'
     OR p_collision_mask_sha256 <>
       encode(
         extensions.digest(
           p_collision_mask,
           'sha256'
         ),
         'hex'
       )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_MAP_COLLISION_HASH_MISMATCH';
  END IF;

  IF p_render_asset_key IS NULL
     OR btrim(p_render_asset_key) = ''
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_MAP_RENDER_ASSET_REQUIRED';
  END IF;

  IF p_selection_weight IS NULL
     OR p_selection_weight <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_MAP_INVALID_SELECTION_WEIGHT';
  END IF;

  IF p_spawn_pairs IS NULL
     OR jsonb_typeof(p_spawn_pairs) <> 'array'
     OR jsonb_array_length(p_spawn_pairs) = 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_MAP_SPAWN_PAIRS_REQUIRED';
  END IF;

  -- Serialize publication of one logical map/version.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_map_key || ':' || p_version::text,
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.cing_artillery_maps AS m
    WHERE m.map_key = p_map_key
      AND m.version = p_version
  )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '23505',
        MESSAGE =
          'CING_ARTILLERY_MAP_VERSION_ALREADY_EXISTS';
  END IF;

  FOR v_spawn IN
    SELECT value
    FROM jsonb_array_elements(
      p_spawn_pairs
    )
  LOOP
    IF jsonb_typeof(v_spawn) <> 'object'
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_MAP_INVALID_SPAWN_PAIR';
    END IF;

    /*
     * Publication input is deliberately strict.
     *
     * Required:
     *   spawn_key
     *   side_a_x
     *   side_a_y
     *   side_b_x
     *   side_b_y
     *
     * Optional:
     *   enabled
     *   selection_weight
     *
     * Unknown fields are rejected rather than silently
     * discarded so the durable publication contract cannot
     * diverge from caller intent.
     */
    IF NOT (
         v_spawn ? 'spawn_key'
         AND v_spawn ? 'side_a_x'
         AND v_spawn ? 'side_a_y'
         AND v_spawn ? 'side_b_x'
         AND v_spawn ? 'side_b_y'
       )
       OR jsonb_typeof(
            v_spawn -> 'spawn_key'
          ) <> 'string'
       OR jsonb_typeof(
            v_spawn -> 'side_a_x'
          ) <> 'number'
       OR jsonb_typeof(
            v_spawn -> 'side_a_y'
          ) <> 'number'
       OR jsonb_typeof(
            v_spawn -> 'side_b_x'
          ) <> 'number'
       OR jsonb_typeof(
            v_spawn -> 'side_b_y'
          ) <> 'number'
       OR (
            v_spawn ? 'enabled'
            AND jsonb_typeof(
                  v_spawn -> 'enabled'
                ) <> 'boolean'
          )
       OR (
            v_spawn ? 'selection_weight'
            AND jsonb_typeof(
                  v_spawn ->
                    'selection_weight'
                ) <> 'number'
          )
       OR (
            v_spawn
            -
            ARRAY[
              'spawn_key',
              'side_a_x',
              'side_a_y',
              'side_b_x',
              'side_b_y',
              'enabled',
              'selection_weight'
            ]::text[]
          ) <> '{}'::jsonb
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_MAP_INVALID_SPAWN_PAIR';
    END IF;

    BEGIN
      v_spawn_key :=
        v_spawn ->> 'spawn_key';

      v_side_a_x :=
        (v_spawn ->> 'side_a_x')::integer;

      v_side_a_y :=
        (v_spawn ->> 'side_a_y')::integer;

      v_side_b_x :=
        (v_spawn ->> 'side_b_x')::integer;

      v_side_b_y :=
        (v_spawn ->> 'side_b_y')::integer;

      v_enabled :=
        COALESCE(
          (v_spawn ->> 'enabled')::boolean,
          true
        );

      v_selection_weight :=
        COALESCE(
          (
            v_spawn ->>
            'selection_weight'
          )::integer,
          1
        );
    EXCEPTION
      WHEN invalid_text_representation
        OR numeric_value_out_of_range
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_MAP_INVALID_SPAWN_PAIR';
    END;

    IF v_spawn_key IS NULL
       OR v_spawn_key !~
         '^[a-z0-9][a-z0-9_-]{1,63}$'
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_MAP_INVALID_SPAWN_KEY';
    END IF;

    IF v_spawn_key =
       ANY(v_seen_spawn_keys)
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_MAP_DUPLICATE_SPAWN_KEY';
    END IF;

    v_seen_spawn_keys :=
      array_append(
        v_seen_spawn_keys,
        v_spawn_key
      );

    IF v_selection_weight <= 0
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_MAP_INVALID_SPAWN_WEIGHT';
    END IF;

    IF v_side_a_x = v_side_b_x
       AND v_side_a_y = v_side_b_y
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_MAP_SPAWN_SIDES_IDENTICAL';
    END IF;

    IF NOT
      public.cing_artillery_validate_map_spawn_surface_v1(
        p_width_px,
        p_height_px,
        p_collision_mask,
        v_side_a_x,
        v_side_a_y
      )
      OR NOT
      public.cing_artillery_validate_map_spawn_surface_v1(
        p_width_px,
        p_height_px,
        p_collision_mask,
        v_side_b_x,
        v_side_b_y
      )
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_MAP_SPAWN_NOT_ON_SURFACE';
    END IF;
  END LOOP;

  INSERT INTO public.cing_artillery_maps (
    id,
    map_key,
    version,
    display_name,
    width_px,
    height_px,
    collision_format,
    collision_mask,
    collision_mask_sha256,
    render_asset_key,
    enabled,
    selection_weight
  )
  VALUES (
    gen_random_uuid(),
    p_map_key,
    p_version,
    btrim(p_display_name),
    p_width_px,
    p_height_px,
    p_collision_format,
    p_collision_mask,
    p_collision_mask_sha256,
    btrim(p_render_asset_key),
    false,
    p_selection_weight
  )
  RETURNING *
  INTO v_map;

  FOR v_spawn IN
    SELECT value
    FROM jsonb_array_elements(
      p_spawn_pairs
    )
  LOOP
    INSERT INTO
      public.cing_artillery_map_spawn_pairs (
        id,
        map_id,
        spawn_key,
        side_a_x,
        side_a_y,
        side_b_x,
        side_b_y,
        enabled,
        selection_weight
      )
    VALUES (
      gen_random_uuid(),
      v_map.id,
      v_spawn ->> 'spawn_key',
      (v_spawn ->> 'side_a_x')::integer,
      (v_spawn ->> 'side_a_y')::integer,
      (v_spawn ->> 'side_b_x')::integer,
      (v_spawn ->> 'side_b_y')::integer,
      COALESCE(
        (v_spawn ->> 'enabled')::boolean,
        true
      ),
      COALESCE(
        (
          v_spawn ->>
          'selection_weight'
        )::integer,
        1
      )
    );
  END LOOP;

  RETURN v_map;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_publish_map_version_atomic(
    text,
    integer,
    text,
    integer,
    integer,
    text,
    bytea,
    text,
    text,
    integer,
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_publish_map_version_atomic(
    text,
    integer,
    text,
    integer,
    integer,
    text,
    bytea,
    text,
    text,
    integer,
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_publish_map_version_atomic(
    text,
    integer,
    text,
    integer,
    integer,
    text,
    bytea,
    text,
    text,
    integer,
    jsonb
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_publish_map_version_atomic(
    text,
    integer,
    text,
    integer,
    integer,
    text,
    bytea,
    text,
    text,
    integer,
    jsonb
  )
TO service_role;


COMMIT;
