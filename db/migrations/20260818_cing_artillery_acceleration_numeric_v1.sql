BEGIN;

-- =====================================================
-- CING ARTILLERY — ACCELERATION NUMERIC AUTHORITY V1
--
-- Numeric representation only.
--
-- Locks:
--
--   gravity
--   wind_min
--   wind_max
--   optional persisted initial_wind
--
-- exactly to physics_fixed_scale.
--
-- This migration intentionally does NOT define:
--
--   physical units
--   acceleration X/Y mapping
--   wind direction semantics
--   timestep integration
--   trajectory
--
-- It also does NOT yet replace combat-world wind
-- generation. Canonical wind sampling is a separate
-- authority checkpoint.
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.cing_artillery_validate_acceleration_numeric_v1(
    p_rules jsonb,
    p_initial_wind numeric DEFAULT NULL
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
CALLED ON NULL INPUT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_physics_version integer;
  v_physics_fixed_scale integer;

  v_gravity numeric;
  v_wind_min numeric;
  v_wind_max numeric;

  v_gravity_scaled numeric;
  v_wind_min_scaled numeric;
  v_wind_max_scaled numeric;
  v_initial_wind_scaled numeric;
BEGIN
  IF p_rules IS NULL THEN
    RETURN false;
  END IF;


  IF jsonb_typeof(
       p_rules
     ) <> 'object'
     OR jsonb_typeof(
          p_rules ->
            'physics_version'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'physics_fixed_scale'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'gravity'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'wind_min'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'wind_max'
        ) <> 'number'
  THEN
    RETURN false;
  END IF;


  IF (
       p_rules ->>
         'physics_version'
     ) !~ '^[1-9][0-9]*$'
     OR (
       p_rules ->>
         'physics_fixed_scale'
     ) !~ '^[1-9][0-9]*$'
  THEN
    RETURN false;
  END IF;


  BEGIN
    v_physics_version :=
      (
        p_rules ->>
          'physics_version'
      )::integer;

    v_physics_fixed_scale :=
      (
        p_rules ->>
          'physics_fixed_scale'
      )::integer;

    v_gravity :=
      (
        p_rules ->>
          'gravity'
      )::numeric;

    v_wind_min :=
      (
        p_rules ->>
          'wind_min'
      )::numeric;

    v_wind_max :=
      (
        p_rules ->>
          'wind_max'
      )::numeric;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN false;
  END;


  IF v_physics_version <> 1
     OR v_physics_fixed_scale <= 0
  THEN
    RETURN false;
  END IF;


  IF v_gravity IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR v_wind_min IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR v_wind_max IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
  THEN
    RETURN false;
  END IF;


  IF v_gravity <= 0
     OR v_wind_min >
        v_wind_max
  THEN
    RETURN false;
  END IF;


  v_gravity_scaled :=
    v_gravity *
    v_physics_fixed_scale;

  v_wind_min_scaled :=
    v_wind_min *
    v_physics_fixed_scale;

  v_wind_max_scaled :=
    v_wind_max *
    v_physics_fixed_scale;


  IF trunc(
       v_gravity_scaled
     ) <>
     v_gravity_scaled
     OR trunc(
          v_wind_min_scaled
        ) <>
        v_wind_min_scaled
     OR trunc(
          v_wind_max_scaled
        ) <>
        v_wind_max_scaled
  THEN
    RETURN false;
  END IF;


  IF p_initial_wind IS NULL THEN
    RETURN true;
  END IF;


  IF p_initial_wind IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR p_initial_wind <
        v_wind_min
     OR p_initial_wind >
        v_wind_max
  THEN
    RETURN false;
  END IF;


  v_initial_wind_scaled :=
    p_initial_wind *
    v_physics_fixed_scale;


  IF trunc(
       v_initial_wind_scaled
     ) <>
     v_initial_wind_scaled
  THEN
    RETURN false;
  END IF;


  RETURN true;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_acceleration_numeric_v1(
    jsonb,
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_acceleration_numeric_v1(
    jsonb,
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_acceleration_numeric_v1(
    jsonb,
    numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_acceleration_numeric_v1(
    jsonb,
    numeric
  )
FROM service_role;


ALTER FUNCTION
  public.cing_artillery_validate_physics_rules_v2(
    jsonb
  )
RENAME TO
  cing_artillery_validate_physics_rules_v2_pre_acceleration_numeric_v1;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_acceleration_numeric_v1(
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_acceleration_numeric_v1(
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_acceleration_numeric_v1(
    jsonb
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_acceleration_numeric_v1(
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
  IF
    public.cing_artillery_validate_physics_rules_v2_pre_acceleration_numeric_v1(
      p_rules
    )
    IS NOT TRUE
  THEN
    RETURN false;
  END IF;


  IF
    public.cing_artillery_validate_acceleration_numeric_v1(
      p_rules,
      NULL::numeric
    )
    IS NOT TRUE
  THEN
    RETURN false;
  END IF;


  RETURN true;
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
