BEGIN;

-- =====================================================
-- CING ARTILLERY
-- TRAJECTORY SAFETY + QUANTIZATION CONTRACT V1
--
-- Scope:
--
--   Physics V1 authoritative computational ceiling:
--
--     MAX_TRAJECTORY_STEPS_V1 = 15000
--
--   where:
--
--     step_count =
--       max_flight_time_ms / physics_step_ms
--
--   Existing V2 validator already guarantees:
--
--     physics_step_ms > 0
--     max_flight_time_ms > physics_step_ms
--     max_flight_time_ms % physics_step_ms = 0
--
--   This migration adds only the computational budget.
--
--   It does NOT:
--
--     activate Rules V2
--     modify a rules snapshot
--     simulate trajectory
--     perform collision
--     mutate gameplay
--
-- Trajectory signed quantization is implemented in the
-- deterministic JS physics layer as:
--
--   sign(numerator) * floor(abs(numerator) / denominator)
--
-- Damage rounding remains independently governed by
-- damage_rounding = 'floor'.
--
-- Existing public validator architecture is preserved:
--
--   current public validator
--       ↓ rename
--   private predecessor
--       ↓
--   new public-name validator
--
-- PostgreSQL remains final durable rules authority.
-- =====================================================


ALTER FUNCTION
  public.cing_artillery_validate_physics_rules_v2(
    jsonb
  )
RENAME TO
  cing_artillery_validate_physics_rules_v2_pre_trajectory_safety_v1;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_trajectory_safety_v1(
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_trajectory_safety_v1(
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_trajectory_safety_v1(
    jsonb
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_trajectory_safety_v1(
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
DECLARE
  v_physics_step_ms bigint;
  v_max_flight_time_ms bigint;
  v_step_count bigint;

  v_max_trajectory_steps_v1 constant bigint :=
    15000;
BEGIN
  IF
    public.cing_artillery_validate_physics_rules_v2_pre_trajectory_safety_v1(
      p_rules
    )
    IS NOT TRUE
  THEN
    RETURN false;
  END IF;


  BEGIN
    v_physics_step_ms :=
      (
        p_rules ->>
        'physics_step_ms'
      )::bigint;

    v_max_flight_time_ms :=
      (
        p_rules ->>
        'max_flight_time_ms'
      )::bigint;
  EXCEPTION
    WHEN invalid_text_representation
      OR numeric_value_out_of_range
    THEN
      RETURN false;
  END;


  IF v_physics_step_ms <= 0
     OR v_max_flight_time_ms <=
        v_physics_step_ms
     OR (
          v_max_flight_time_ms %
          v_physics_step_ms
        ) <> 0
  THEN
    RETURN false;
  END IF;


  v_step_count :=
    v_max_flight_time_ms /
    v_physics_step_ms;


  IF v_step_count >
       v_max_trajectory_steps_v1
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
