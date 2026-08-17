BEGIN;

-- =====================================================
-- CING ARTILLERY — DETERMINISTIC TRIG ALGORITHM V1
-- AUTHORITY
--
-- Dependency:
--
--   v2_trig_representation_authority
--     ->
--   THIS MIGRATION
--
-- Adds:
--
--   trig_algorithm_version = 1
--
-- Trig Algorithm V1 canonical representation:
--
--   trig_angle_scale = 1000000000 units / degree
--   trig_value_scale = 1000000000 units / 1.0
--
-- CORDIC iteration count is algorithm semantics and is
-- deliberately NOT a gameplay rules field.
--
-- No atan table.
-- No gain constant.
-- No sin/cos implementation.
-- No V2 activation.
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.cing_artillery_validate_trig_algorithm_v1(
    p_rules jsonb
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_version bigint;
  v_angle_scale bigint;
  v_value_scale bigint;
BEGIN
  IF jsonb_typeof(
       p_rules
     ) <> 'object'
     OR jsonb_typeof(
          p_rules ->
            'trig_algorithm_version'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'trig_angle_scale'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'trig_value_scale'
        ) <> 'number'
  THEN
    RETURN false;
  END IF;


  IF (
       p_rules ->>
         'trig_algorithm_version'
     ) !~ '^[1-9][0-9]*$'
     OR (
       p_rules ->>
         'trig_angle_scale'
     ) !~ '^[1-9][0-9]*$'
     OR (
       p_rules ->>
         'trig_value_scale'
     ) !~ '^[1-9][0-9]*$'
  THEN
    RETURN false;
  END IF;


  BEGIN
    v_version :=
      (
        p_rules ->>
          'trig_algorithm_version'
      )::bigint;

    v_angle_scale :=
      (
        p_rules ->>
          'trig_angle_scale'
      )::bigint;

    v_value_scale :=
      (
        p_rules ->>
          'trig_value_scale'
      )::bigint;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN false;
  END;


  RETURN
    v_version = 1
    AND
    v_angle_scale = 1000000000
    AND
    v_value_scale = 1000000000;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_trig_algorithm_v1(
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_trig_algorithm_v1(
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_trig_algorithm_v1(
    jsonb
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_trig_algorithm_v1(
    jsonb
  )
FROM service_role;


-- =====================================================
-- Extend latest V2 validator.
--
-- Shot acceptance already calls the public V2 validator,
-- so no shot RPC rewrite is required here.
-- =====================================================

ALTER FUNCTION
  public.cing_artillery_validate_physics_rules_v2(
    jsonb
  )
RENAME TO
  cing_artillery_validate_physics_rules_v2_pre_trig_algorithm_v1;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_trig_algorithm_v1(
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_trig_algorithm_v1(
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_trig_algorithm_v1(
    jsonb
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_trig_algorithm_v1(
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
  IF jsonb_typeof(
       p_rules
     ) <> 'object'
     OR jsonb_typeof(
          p_rules ->
            'trig_algorithm_version'
        ) <> 'number'
  THEN
    RETURN false;
  END IF;


  IF NOT
    public.cing_artillery_validate_physics_rules_v2_pre_trig_algorithm_v1(
      p_rules -
        'trig_algorithm_version'
    )
  THEN
    RETURN false;
  END IF;


  RETURN
    public.cing_artillery_validate_trig_algorithm_v1(
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
