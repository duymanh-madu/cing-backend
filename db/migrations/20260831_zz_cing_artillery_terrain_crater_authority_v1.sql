BEGIN;


/*
 * =====================================================
 * CING PIU PIU / CING ARTILLERY
 * AUTHORITATIVE TERRAIN CRATER V1
 * =====================================================
 *
 * Purpose:
 *
 *   Mutate ONLY the per-combat mutable terrain snapshot
 *   after one canonical terrain_hit resolution.
 *
 * Authority:
 *
 *   - resolution owns canonical exact affine impact
 *   - combat rules_snapshot owns blast radius
 *   - combat terrain owns mutable collision mask
 *   - published map remains immutable
 *
 * Crater geometry:
 *
 *   closed disk centered at the exact projectile-center
 *   impact.
 *
 *   Each terrain pixel is represented by its pixel center:
 *
 *     ((2*x + 1) / 2, (2*y + 1) / 2)
 *
 *   Exact affine-point / circle classification decides
 *   whether that pixel is removed.
 *
 * This function does NOT:
 *
 *   - trust impact_x / impact_y compatibility projection
 *   - accept caller-supplied impact geometry
 *   - accept caller-supplied radius
 *   - accept caller-supplied collision mask
 *   - mutate published map data
 *   - resolve player support
 *   - advance turns
 *   - complete matches
 *   - mutate HP
 *
 * Integration into fenced shot settlement is deliberately
 * a later checkpoint.
 * =====================================================
 */


CREATE OR REPLACE FUNCTION
  public.cing_artillery_apply_terrain_crater_private_v1(
    p_combat_state_id uuid,
    p_shot_resolution_id uuid
  )
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_resolution
    public.cing_artillery_shot_resolutions%ROWTYPE;

  v_terrain
    public.cing_artillery_combat_terrain_states%ROWTYPE;

  v_rules jsonb;

  v_scale bigint;
  v_radius_scaled bigint;

  v_row_bytes integer;

  v_x integer;
  v_y integer;

  v_pixel_center_x_scaled bigint;
  v_pixel_center_y_scaled bigint;

  v_relation text;

  v_byte_index integer;
  v_bit_offset integer;
  v_bit_mask integer;
  v_old_byte integer;
  v_new_byte integer;

  v_new_mask bytea;

  v_pixels_removed integer := 0;

  v_min_x integer := NULL;
  v_max_x integer := NULL;
  v_min_y integer := NULL;
  v_max_y integer := NULL;

  v_scan_min_x integer;
  v_scan_max_x integer;
  v_scan_min_y integer;
  v_scan_max_y integer;

  v_changed boolean := false;
  v_revision bigint;

  v_now timestamptz;
  v_row_count integer;
BEGIN
  IF p_combat_state_id IS NULL
     OR p_shot_resolution_id IS NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_CRATER_ARGUMENT_INVALID';
  END IF;


  /*
   * Combat is the outer serialization fence.
   *
   * This matches the existing combat-scoped authority model
   * and prevents concurrent terrain mutations for one combat.
   */
  SELECT *
  INTO v_combat
  FROM public.cing_artillery_combat_states
  WHERE id = p_combat_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_CRATER_COMBAT_NOT_FOUND';
  END IF;


  IF v_combat.status <> 'initialized'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '55000',
        MESSAGE =
          'CING_ARTILLERY_CRATER_COMBAT_NOT_INITIALIZED';
  END IF;


  /*
   * The durable resolution is immutable canonical shot output.
   */
  SELECT *
  INTO v_resolution
  FROM public.cing_artillery_shot_resolutions
  WHERE id = p_shot_resolution_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_CRATER_RESOLUTION_NOT_FOUND';
  END IF;


  IF v_resolution.combat_state_id <>
       p_combat_state_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '55000',
        MESSAGE =
          'CING_ARTILLERY_CRATER_RESOLUTION_COMBAT_MISMATCH';
  END IF;


  /*
   * V1 terrain destruction belongs ONLY to terrain_hit.
   *
   * player_hit keeps its existing direct-hit semantics.
   */
  IF v_resolution.outcome <> 'terrain_hit'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '55000',
        MESSAGE =
          'CING_ARTILLERY_CRATER_RESOLUTION_NOT_TERRAIN_HIT';
  END IF;


  /*
   * Require the exact-impact authority, never the compatibility
   * impact_x / impact_y projection.
   */
  IF v_resolution.impact_physics_fixed_scale IS NULL
     OR v_resolution.impact_start_x_scaled IS NULL
     OR v_resolution.impact_start_y_scaled IS NULL
     OR v_resolution.impact_delta_x_scaled IS NULL
     OR v_resolution.impact_delta_y_scaled IS NULL
     OR v_resolution.impact_contact_kind IS NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '55000',
        MESSAGE =
          'CING_ARTILLERY_CRATER_EXACT_IMPACT_MISSING';
  END IF;


  IF public.cing_artillery_validate_contact_parameter_private_v1(
       v_resolution.impact_contact_kind,
       v_resolution.impact_contact_numerator,
       v_resolution.impact_contact_denominator,
       v_resolution.impact_contact_a,
       v_resolution.impact_contact_b,
       v_resolution.impact_contact_discriminant
     )
     IS NOT TRUE
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '55000',
        MESSAGE =
          'CING_ARTILLERY_CRATER_EXACT_CONTACT_INVALID';
  END IF;


  /*
   * Mutable terrain must already exist for the combat.
   *
   * Crater mutation does not silently initialize unrelated
   * world state inside settlement.
   */
  SELECT *
  INTO v_terrain
  FROM public.cing_artillery_combat_terrain_states
  WHERE combat_state_id = p_combat_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '55000',
        MESSAGE =
          'CING_ARTILLERY_CRATER_TERRAIN_NOT_INITIALIZED';
  END IF;


  IF v_terrain.match_runtime_id <>
       v_resolution.match_runtime_id
     OR v_terrain.match_id <>
       v_resolution.match_id
     OR v_terrain.width_px <= 0
     OR v_terrain.height_px <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '55000',
        MESSAGE =
          'CING_ARTILLERY_CRATER_TERRAIN_IDENTITY_INVALID';
  END IF;


  IF public.cing_artillery_validate_collision_bitmask_v1(
       v_terrain.width_px,
       v_terrain.height_px,
       v_terrain.collision_mask
     )
     IS NOT TRUE
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '55000',
        MESSAGE =
          'CING_ARTILLERY_CRATER_TERRAIN_MASK_INVALID';
  END IF;


  v_rules := v_combat.rules_snapshot;

  IF jsonb_typeof(v_rules) <> 'object'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '55000',
        MESSAGE =
          'CING_ARTILLERY_CRATER_RULES_SNAPSHOT_INVALID';
  END IF;


  v_scale :=
    v_resolution.impact_physics_fixed_scale;

  IF v_scale <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '55000',
        MESSAGE =
          'CING_ARTILLERY_CRATER_SCALE_INVALID';
  END IF;


  IF jsonb_typeof(
       v_rules -> 'physics_fixed_scale'
     ) <> 'number'
     OR (
       v_rules ->> 'physics_fixed_scale'
     ) !~ '^[1-9][0-9]*$'
     OR (
       v_rules ->> 'physics_fixed_scale'
     )::bigint <> v_scale
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '55000',
        MESSAGE =
          'CING_ARTILLERY_CRATER_RULE_SCALE_MISMATCH';
  END IF;


  v_radius_scaled :=
    public.cing_artillery_blast_radius_scaled_private_v1(
      v_rules
    );


  /*
   * Safe integer bounding box.
   *
   * We intentionally derive only a conservative pixel-space
   * scan bound from the already-validated compatibility
   * projection.
   *
   * Membership itself NEVER uses the projection; exact affine
   * geometry below remains final authority.
   *
   * Expand by one pixel around ceil(radius) so projection-grid
   * rounding can never exclude a true crater pixel.
   */
  IF v_resolution.impact_x IS NULL
     OR v_resolution.impact_y IS NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '55000',
        MESSAGE =
          'CING_ARTILLERY_CRATER_COMPATIBILITY_PROJECTION_MISSING';
  END IF;


  v_scan_min_x :=
    greatest(
      0,
      floor(
        v_resolution.impact_x
        -
        ceil(
          v_radius_scaled::numeric /
          v_scale::numeric
        )
        -
        1
      )::integer
    );

  v_scan_max_x :=
    least(
      v_terrain.width_px - 1,
      ceil(
        v_resolution.impact_x
        +
        ceil(
          v_radius_scaled::numeric /
          v_scale::numeric
        )
        +
        1
      )::integer
    );

  v_scan_min_y :=
    greatest(
      0,
      floor(
        v_resolution.impact_y
        -
        ceil(
          v_radius_scaled::numeric /
          v_scale::numeric
        )
        -
        1
      )::integer
    );

  v_scan_max_y :=
    least(
      v_terrain.height_px - 1,
      ceil(
        v_resolution.impact_y
        +
        ceil(
          v_radius_scaled::numeric /
          v_scale::numeric
        )
        +
        1
      )::integer
    );


  v_new_mask :=
    v_terrain.collision_mask;

  v_row_bytes :=
    (v_terrain.width_px + 7) / 8;


  IF v_scan_min_x <= v_scan_max_x
     AND v_scan_min_y <= v_scan_max_y
  THEN
    FOR v_y IN
      v_scan_min_y..v_scan_max_y
    LOOP
      /*
       * Pixel-center scaled coordinate:
       *
       *   (y + 1/2) * scale
       *
       * Exact integer representation requires even scale.
       * Existing physics scale is authoritative; fail closed
       * rather than introducing half-unit rounding.
       */
      IF (v_scale % 2) <> 0
      THEN
        RAISE EXCEPTION
          USING
            ERRCODE = '55000',
            MESSAGE =
              'CING_ARTILLERY_CRATER_PIXEL_CENTER_NOT_EXACTLY_REPRESENTABLE';
      END IF;

      v_pixel_center_y_scaled :=
        v_y::bigint * v_scale
        +
        (v_scale / 2);


      FOR v_x IN
        v_scan_min_x..v_scan_max_x
      LOOP
        /*
         * Skip empty pixels before exact geometry.
         */
        IF public.cing_artillery_terrain_pixel_solid_private_v1(
             v_terrain.width_px,
             v_terrain.height_px,
             v_new_mask,
             v_x,
             v_y
           )
           IS NOT TRUE
        THEN
          CONTINUE;
        END IF;


        v_pixel_center_x_scaled :=
          v_x::bigint * v_scale
          +
          (v_scale / 2);


        v_relation :=
          public.cing_artillery_classify_affine_point_circle_private_v1(
            v_resolution.impact_start_x_scaled,
            v_resolution.impact_start_y_scaled,
            v_resolution.impact_delta_x_scaled,
            v_resolution.impact_delta_y_scaled,

            v_resolution.impact_contact_kind,
            v_resolution.impact_contact_numerator,
            v_resolution.impact_contact_denominator,
            v_resolution.impact_contact_a,
            v_resolution.impact_contact_b,
            v_resolution.impact_contact_discriminant,

            v_pixel_center_x_scaled,
            v_pixel_center_y_scaled,
            v_radius_scaled
          );


        IF v_relation NOT IN (
             'inside',
             'tangent',
             'outside'
           )
        THEN
          RAISE EXCEPTION
            USING
              ERRCODE = '55000',
              MESSAGE =
                'CING_ARTILLERY_CRATER_GEOMETRY_RESULT_INVALID';
        END IF;


        IF v_relation IN (
             'inside',
             'tangent'
           )
        THEN
          v_byte_index :=
            (v_y * v_row_bytes)
            +
            (v_x / 8);

          v_bit_offset :=
            v_x % 8;

          v_bit_mask :=
            128 >> v_bit_offset;

          v_old_byte :=
            get_byte(
              v_new_mask,
              v_byte_index
            );

          v_new_byte :=
            v_old_byte &
            (255 # v_bit_mask);

          IF v_new_byte <> v_old_byte
          THEN
            v_new_mask :=
              set_byte(
                v_new_mask,
                v_byte_index,
                v_new_byte
              );

            v_pixels_removed :=
              v_pixels_removed + 1;

            v_min_x :=
              CASE
                WHEN v_min_x IS NULL
                  THEN v_x
                ELSE least(v_min_x, v_x)
              END;

            v_max_x :=
              CASE
                WHEN v_max_x IS NULL
                  THEN v_x
                ELSE greatest(v_max_x, v_x)
              END;

            v_min_y :=
              CASE
                WHEN v_min_y IS NULL
                  THEN v_y
                ELSE least(v_min_y, v_y)
              END;

            v_max_y :=
              CASE
                WHEN v_max_y IS NULL
                  THEN v_y
                ELSE greatest(v_max_y, v_y)
              END;
          END IF;
        END IF;
      END LOOP;
    END LOOP;
  END IF;


  IF public.cing_artillery_validate_collision_bitmask_v1(
       v_terrain.width_px,
       v_terrain.height_px,
       v_new_mask
     )
     IS NOT TRUE
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '55000',
        MESSAGE =
          'CING_ARTILLERY_CRATER_MUTATED_MASK_INVALID';
  END IF;


  v_changed :=
    v_pixels_removed > 0;


  IF v_changed
  THEN
    v_now := clock_timestamp();

    UPDATE
      public.cing_artillery_combat_terrain_states
    SET
      collision_mask = v_new_mask,
      terrain_revision =
        terrain_revision + 1,
      updated_at = v_now
    WHERE id = v_terrain.id
      AND terrain_revision =
        v_terrain.terrain_revision;

    GET DIAGNOSTICS
      v_row_count = ROW_COUNT;

    IF v_row_count <> 1
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '40001',
          MESSAGE =
            'CING_ARTILLERY_CRATER_TERRAIN_REVISION_FENCE_FAILED';
    END IF;

    v_revision :=
      v_terrain.terrain_revision + 1;
  ELSE
    v_revision :=
      v_terrain.terrain_revision;
  END IF;


  RETURN jsonb_build_object(
    'combat_state_id',
      p_combat_state_id,
    'shot_resolution_id',
      p_shot_resolution_id,
    'changed',
      v_changed,
    'pixels_removed',
      v_pixels_removed,
    'terrain_revision',
      v_revision,
    'bounds',
      CASE
        WHEN v_changed
        THEN jsonb_build_object(
          'min_x', v_min_x,
          'max_x', v_max_x,
          'min_y', v_min_y,
          'max_y', v_max_y
        )
        ELSE NULL
      END
  );
END;
$$;


/*
 * Private-only gameplay authority.
 */
REVOKE ALL
ON FUNCTION
  public.cing_artillery_apply_terrain_crater_private_v1(
    uuid,
    uuid
  )
FROM PUBLIC, anon, authenticated, service_role;


COMMIT;
