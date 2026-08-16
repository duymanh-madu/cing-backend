BEGIN;

-- =====================================================
-- CING ARTILLERY — MAP ENABLE / DISABLE AUTHORITY
--
-- Purpose:
--
--   explicit lifecycle authority controlling whether one
--   immutable published map version may participate in
--   future combat-world selection.
--
-- Publication and selection lifecycle remain separate:
--
--   publish
--     -> always disabled
--
--   explicit enable
--     -> validate durable map + enabled spawn authority
--     -> enabled
--
--   explicit disable
--     -> disabled
--
-- This authority does NOT:
--
--   mutate collision geometry
--   mutate spawn geometry
--   create maps
--   create spawn pairs
--   select maps for combat
--   initialize combat world
--   perform physics
--   perform damage
--
-- PostgreSQL remains the final durable authority.
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.cing_artillery_set_map_version_enabled_atomic(
    p_map_id uuid,
    p_enabled boolean
  )
RETURNS public.cing_artillery_maps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_map
    public.cing_artillery_maps%ROWTYPE;

  v_spawn
    public.cing_artillery_map_spawn_pairs%ROWTYPE;

  v_enabled_spawn_count integer :=
    0;

  v_now timestamptz;
BEGIN
  IF p_map_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_MAP_ID_REQUIRED';
  END IF;

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_MAP_ENABLED_STATE_REQUIRED';
  END IF;

  /*
   * Canonical lock order:
   *
   *   map
   *     ->
   *   spawn pairs
   *
   * All lifecycle callers for this authority must preserve
   * this ordering.
   */
  SELECT m.*
  INTO v_map
  FROM public.cing_artillery_maps AS m
  WHERE m.id =
    p_map_id
  FOR UPDATE;

  IF v_map.id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_MAP_NOT_FOUND';
  END IF;

  /*
   * Idempotent DISABLE request.
   *
   * A disabled map makes no positive eligibility claim, so
   * disabled -> disabled may return immediately without
   * touching updated_at.
   *
   * ENABLE requests intentionally do NOT return here.
   * Even when the map is already enabled, PostgreSQL must
   * revalidate collision identity and enabled spawn
   * eligibility before confirming the canonical state.
   */
  IF p_enabled = false
     AND v_map.enabled = false
  THEN
    RETURN v_map;
  END IF;

  /*
   * Disable is intentionally simple:
   *
   *   - geometry remains immutable
   *   - spawn authority remains intact
   *   - historical identity remains intact
   *
   * Only future selection eligibility changes.
   */
  IF p_enabled = false THEN
    v_now :=
      clock_timestamp();

    UPDATE public.cing_artillery_maps
    SET
      enabled =
        false,

      updated_at =
        v_now
    WHERE id =
      v_map.id
    RETURNING *
    INTO v_map;

    IF v_map.id IS NULL
       OR v_map.enabled <> false
       OR v_map.updated_at <>
          v_now
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_MAP_ENABLE_STATE_INCONSISTENT';
    END IF;

    RETURN v_map;
  END IF;

  -- ===================================================
  -- ENABLE VALIDATION
  -- ===================================================

  /*
   * Revalidate canonical collision representation even
   * though table constraints already enforce it.
   *
   * The lifecycle transition therefore fails closed if
   * durable state was ever altered outside normal
   * application authority.
   */
  IF v_map.collision_format <>
       'bitmask_v1'
     OR NOT
       public.cing_artillery_validate_collision_bitmask_v1(
         v_map.width_px,
         v_map.height_px,
         v_map.collision_mask
       )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_MAP_ENABLE_COLLISION_INVALID';
  END IF;

  /*
   * Durable content identity must still match the actual
   * canonical collision bytes.
   */
  IF v_map.collision_mask_sha256 !~
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
          'CING_ARTILLERY_MAP_ENABLE_COLLISION_HASH_INVALID';
  END IF;

  /*
   * Lock all spawn rows for this map before determining
   * selection eligibility.
   *
   * Although application writes are already RPC-closed,
   * this keeps the lifecycle boundary transactionally
   * canonical if future spawn lifecycle authority is added.
   */
  FOR v_spawn IN
    SELECT s.*
    FROM public.cing_artillery_map_spawn_pairs AS s
    WHERE s.map_id =
      v_map.id
    ORDER BY
      s.id
    FOR UPDATE
  LOOP
    IF v_spawn.enabled THEN
      v_enabled_spawn_count :=
        v_enabled_spawn_count + 1;

      /*
       * Every enabled spawn pair must remain valid against
       * this immutable map collision authority.
       *
       * Disabled spawn pairs do not participate in future
       * map selection and therefore do not block enabling.
       */
      IF NOT
        public.cing_artillery_validate_map_spawn_surface_v1(
          v_map.width_px,
          v_map.height_px,
          v_map.collision_mask,
          v_spawn.side_a_x,
          v_spawn.side_a_y
        )
        OR NOT
        public.cing_artillery_validate_map_spawn_surface_v1(
          v_map.width_px,
          v_map.height_px,
          v_map.collision_mask,
          v_spawn.side_b_x,
          v_spawn.side_b_y
        )
      THEN
        RAISE EXCEPTION
          USING
            ERRCODE = 'P0001',
            MESSAGE =
              'CING_ARTILLERY_MAP_ENABLE_SPAWN_INVALID';
      END IF;
    END IF;
  END LOOP;

  IF v_enabled_spawn_count <= 0 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_MAP_ENABLE_REQUIRES_SPAWN';
  END IF;

  /*
   * Already-enabled state has now passed the complete
   * eligibility revalidation above.
   *
   * Preserve updated_at because no durable transition is
   * required.
   */
  IF v_map.enabled = true THEN
    RETURN v_map;
  END IF;

  v_now :=
    clock_timestamp();

  UPDATE public.cing_artillery_maps
  SET
    enabled =
      true,

    updated_at =
      v_now
  WHERE id =
    v_map.id
  RETURNING *
  INTO v_map;

  IF v_map.id IS NULL
     OR v_map.enabled <> true
     OR v_map.updated_at <>
        v_now
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_MAP_ENABLE_STATE_INCONSISTENT';
  END IF;

  RETURN v_map;
END;
$$;


-- =====================================================
-- PRIVATE SERVER-SIDE LIFECYCLE RPC
-- =====================================================

REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_map_version_enabled_atomic(
    uuid,
    boolean
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_map_version_enabled_atomic(
    uuid,
    boolean
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_map_version_enabled_atomic(
    uuid,
    boolean
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_map_version_enabled_atomic(
    uuid,
    boolean
  )
FROM service_role;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_set_map_version_enabled_atomic(
    uuid,
    boolean
  )
TO service_role;


COMMIT;
