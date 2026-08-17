BEGIN;

-- =====================================================
-- CING ARTILLERY
-- ACCELERATION NUMERIC SAFE-MAGNITUDE PARITY V1
--
-- JS Fixed Point V1 already defines:
--
--   MAX_SAFE_SCALED_MAGNITUDE
--     = Number.MAX_SAFE_INTEGER
--     = 9007199254740991
--
-- Acceleration Numeric V1 uses that authority through
-- toScaledBigInt().
--
-- PostgreSQL must enforce the same scaled domain for:
--
--   gravity
--   wind_min
--   wind_max
--   optional persisted initial_wind
--
-- This migration closes JS/PostgreSQL validation parity.
--
-- It does NOT:
--
--   change wind generation
--   define physical units
--   define ax / ay
--   integrate trajectories
-- =====================================================


ALTER FUNCTION
  public.cing_artillery_validate_acceleration_numeric_v1(
    jsonb,
    numeric
  )
RENAME TO
  cing_artillery_validate_acceleration_numeric_v1_pre_safe_magnitude_v1;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_acceleration_numeric_v1_pre_safe_magnitude_v1(
    jsonb,
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_acceleration_numeric_v1_pre_safe_magnitude_v1(
    jsonb,
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_acceleration_numeric_v1_pre_safe_magnitude_v1(
    jsonb,
    numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_acceleration_numeric_v1_pre_safe_magnitude_v1(
    jsonb,
    numeric
  )
FROM service_role;


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
  v_max_safe_scaled constant numeric :=
    9007199254740991::numeric;

  v_physics_fixed_scale integer;

  v_gravity numeric;
  v_wind_min numeric;
  v_wind_max numeric;

  v_gravity_scaled numeric;
  v_wind_min_scaled numeric;
  v_wind_max_scaled numeric;
  v_initial_wind_scaled numeric;
BEGIN
  IF
    public.cing_artillery_validate_acceleration_numeric_v1_pre_safe_magnitude_v1(
      p_rules,
      p_initial_wind
    )
    IS NOT TRUE
  THEN
    RETURN false;
  END IF;


  IF p_rules IS NULL THEN
    RETURN false;
  END IF;


  BEGIN
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


  v_gravity_scaled :=
    v_gravity *
    v_physics_fixed_scale;

  v_wind_min_scaled :=
    v_wind_min *
    v_physics_fixed_scale;

  v_wind_max_scaled :=
    v_wind_max *
    v_physics_fixed_scale;


  IF abs(
       v_gravity_scaled
     ) >
       v_max_safe_scaled
     OR abs(
          v_wind_min_scaled
        ) >
          v_max_safe_scaled
     OR abs(
          v_wind_max_scaled
        ) >
          v_max_safe_scaled
  THEN
    RETURN false;
  END IF;


  IF p_initial_wind IS NULL THEN
    RETURN true;
  END IF;


  v_initial_wind_scaled :=
    p_initial_wind *
    v_physics_fixed_scale;


  IF abs(
       v_initial_wind_scaled
     ) >
       v_max_safe_scaled
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


COMMIT;
