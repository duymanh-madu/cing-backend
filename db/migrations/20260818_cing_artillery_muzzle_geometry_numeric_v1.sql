BEGIN;

-- =====================================================
-- CING ARTILLERY — MUZZLE GEOMETRY NUMERIC V1
--
-- Canonical world semantics already established:
--
--   spawn point = character ground-contact anchor
--   +X = right
--   +Y = down
--
-- This migration extends Rules V2 numeric authority so:
--
--   muzzle_offset_forward_px
--   muzzle_offset_up_px
--
-- must both lie exactly on physics_fixed_scale.
--
-- It does NOT calculate muzzle origin.
-- It does NOT activate Rules V2.
-- It does NOT mutate gameplay state.
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.cing_artillery_validate_muzzle_geometry_numeric_v1(
    p_rules jsonb
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_physics_version integer;
  v_physics_fixed_scale integer;

  v_forward numeric;
  v_up numeric;
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
            'physics_fixed_scale'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'muzzle_offset_forward_px'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'muzzle_offset_up_px'
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

    v_forward :=
      (
        p_rules ->>
          'muzzle_offset_forward_px'
      )::numeric;

    v_up :=
      (
        p_rules ->>
          'muzzle_offset_up_px'
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


  IF v_forward IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR v_up IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
  THEN
    RETURN false;
  END IF;


  IF v_forward < 0
     OR v_up <= 0
  THEN
    RETURN false;
  END IF;


  IF trunc(
       v_forward *
       v_physics_fixed_scale
     ) <>
     (
       v_forward *
       v_physics_fixed_scale
     )
     OR trunc(
       v_up *
       v_physics_fixed_scale
     ) <>
     (
       v_up *
       v_physics_fixed_scale
     )
  THEN
    RETURN false;
  END IF;


  RETURN true;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_muzzle_geometry_numeric_v1(
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_muzzle_geometry_numeric_v1(
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_muzzle_geometry_numeric_v1(
    jsonb
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_muzzle_geometry_numeric_v1(
    jsonb
  )
FROM service_role;


ALTER FUNCTION
  public.cing_artillery_validate_physics_rules_v2(
    jsonb
  )
RENAME TO
  cing_artillery_validate_physics_rules_v2_pre_muzzle_geometry_numeric_v1;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_muzzle_geometry_numeric_v1(
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_muzzle_geometry_numeric_v1(
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_muzzle_geometry_numeric_v1(
    jsonb
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_muzzle_geometry_numeric_v1(
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
    public.cing_artillery_validate_physics_rules_v2_pre_muzzle_geometry_numeric_v1(
      p_rules
    )
    IS NOT TRUE
  THEN
    RETURN false;
  END IF;


  IF
    public.cing_artillery_validate_muzzle_geometry_numeric_v1(
      p_rules
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
