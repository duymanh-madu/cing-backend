BEGIN;

-- =====================================================
-- CING ARTILLERY — SHOT ANGLE CONVENTION V1
--
-- Dependency:
--
--   v2_trig_v1_algorithm_authority
--     ->
--   THIS MIGRATION
--
-- Physics V1 canonical shot angle:
--
--   angle_deg =
--     elevation above local forward horizontal
--
--   0 degrees  = horizontal
--   90 degrees = vertical upward
--
-- World coordinates:
--
--   +X = right
--   +Y = down
--
-- Future launch vector semantics:
--
--   horizontal =
--     fire_direction_x_sign * cos(angle)
--
--   vertical =
--     -sin(angle)
--
-- No trig implementation.
-- No CORDIC rotation kernel.
-- No trajectory solver.
-- No V2 activation.
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.cing_artillery_validate_shot_angle_convention_v1(
    p_rules jsonb
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_physics_version bigint;

  v_angle_min numeric;
  v_angle_max numeric;
BEGIN
  IF jsonb_typeof(
       p_rules
     ) <> 'object'
     OR jsonb_typeof(
          p_rules ->
            'physics_version'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'angle_min_deg'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'angle_max_deg'
        ) <> 'number'
  THEN
    RETURN false;
  END IF;


  IF (
       p_rules ->>
         'physics_version'
     ) !~ '^[1-9][0-9]*$'
  THEN
    RETURN false;
  END IF;


  BEGIN
    v_physics_version :=
      (
        p_rules ->>
          'physics_version'
      )::bigint;

    v_angle_min :=
      (
        p_rules ->>
          'angle_min_deg'
      )::numeric;

    v_angle_max :=
      (
        p_rules ->>
          'angle_max_deg'
      )::numeric;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN false;
  END;


  IF v_physics_version <> 1 THEN
    RETURN false;
  END IF;


  IF v_angle_min IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR v_angle_max IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
  THEN
    RETURN false;
  END IF;


  RETURN
    v_angle_min >= 0
    AND
    v_angle_max <= 90
    AND
    v_angle_max >= v_angle_min;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_shot_angle_convention_v1(
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_shot_angle_convention_v1(
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_shot_angle_convention_v1(
    jsonb
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_shot_angle_convention_v1(
    jsonb
  )
FROM service_role;


ALTER FUNCTION
  public.cing_artillery_validate_physics_rules_v2(
    jsonb
  )
RENAME TO
  cing_artillery_validate_physics_rules_v2_pre_shot_angle_convention_v1;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_shot_angle_convention_v1(
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_shot_angle_convention_v1(
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_shot_angle_convention_v1(
    jsonb
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_shot_angle_convention_v1(
    jsonb
  )
FROM service_role;


CREATE OR REPLACE FUNCTION
  public.cing_artillery_validate_physics_rules_v2(
    p_rules jsonb
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT
    public.cing_artillery_validate_physics_rules_v2_pre_shot_angle_convention_v1(
      p_rules
    )
  THEN
    RETURN false;
  END IF;


  RETURN
    public.cing_artillery_validate_shot_angle_convention_v1(
      p_rules
    );
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2(
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2(
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2(
    jsonb
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2(
    jsonb
  )
FROM service_role;


COMMIT;
