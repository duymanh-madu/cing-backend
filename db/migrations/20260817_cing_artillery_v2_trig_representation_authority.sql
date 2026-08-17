BEGIN;

-- =====================================================
-- CING ARTILLERY — PHYSICS V2 TRIG REPRESENTATION
-- AUTHORITY V1
--
-- Dependency:
--
--   physics_rules_v2_contract
--   v2_angle_grid_authority
--     ->
--   THIS MIGRATION
--
-- Rules V2 gains:
--
--   trig_angle_scale
--   trig_value_scale
--
-- physics_fixed_scale and trig_angle_scale are independent.
--
-- Every canonical angle-grid point must map exactly to the
-- trig-angle integer lattice.
--
-- trig_value_scale is an independent dimensionless output
-- scale used by the later deterministic trig algorithm.
--
-- No rounding.
-- No CORDIC implementation.
-- No V2 activation.
-- =====================================================


-- =====================================================
-- PRIVATE TRIG REPRESENTATION VALIDATOR
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_validate_trig_representation_v1(
    p_rules jsonb
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_physics_scale bigint;
  v_trig_angle_scale bigint;
  v_trig_value_scale bigint;

  v_angle_min numeric;
  v_angle_max numeric;
  v_angle_step numeric;

  v_min_physics numeric;
  v_max_physics numeric;
  v_step_physics numeric;

  v_min_trig_numerator numeric;
  v_max_trig_numerator numeric;
  v_step_trig_numerator numeric;

  v_max_safe_integer constant numeric :=
    9007199254740991;
BEGIN
  IF jsonb_typeof(
       p_rules
     ) <> 'object'
     OR jsonb_typeof(
          p_rules ->
            'physics_fixed_scale'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'trig_angle_scale'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'trig_value_scale'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'angle_min_deg'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'angle_max_deg'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'angle_step_deg'
        ) <> 'number'
  THEN
    RETURN false;
  END IF;


  -- Match JavaScript positive-safe-integer authority.
  IF (
       p_rules ->>
         'physics_fixed_scale'
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
    v_physics_scale :=
      (
        p_rules ->>
          'physics_fixed_scale'
      )::bigint;

    v_trig_angle_scale :=
      (
        p_rules ->>
          'trig_angle_scale'
      )::bigint;

    v_trig_value_scale :=
      (
        p_rules ->>
          'trig_value_scale'
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

    v_angle_step :=
      (
        p_rules ->>
          'angle_step_deg'
      )::numeric;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN false;
  END;


  IF v_physics_scale <= 0
     OR v_trig_angle_scale <= 0
     OR v_trig_value_scale <= 0
     OR v_physics_scale >
        v_max_safe_integer
     OR v_trig_angle_scale >
        v_max_safe_integer
     OR v_trig_value_scale >
        v_max_safe_integer
  THEN
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
     OR v_angle_step IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
  THEN
    RETURN false;
  END IF;


  -- First prove these values lie exactly on the gameplay
  -- fixed-point lattice.
  v_min_physics :=
    v_angle_min *
    v_physics_scale;

  v_max_physics :=
    v_angle_max *
    v_physics_scale;

  v_step_physics :=
    v_angle_step *
    v_physics_scale;


  IF v_min_physics <>
       trunc(v_min_physics)
     OR v_max_physics <>
       trunc(v_max_physics)
     OR v_step_physics <>
       trunc(v_step_physics)
     OR v_step_physics <= 0
  THEN
    RETURN false;
  END IF;


  /*
   * Exact representation conversion:
   *
   * physics_angle_integer
   *   *
   * trig_angle_scale
   *   /
   * physics_fixed_scale
   *
   * must divide exactly for min/max/step.
   *
   * Because the canonical grid is:
   *
   *   min + N * step
   *
   * exact min + exact step implies every grid point is exact.
   */

  v_min_trig_numerator :=
    v_min_physics *
    v_trig_angle_scale;

  v_max_trig_numerator :=
    v_max_physics *
    v_trig_angle_scale;

  v_step_trig_numerator :=
    v_step_physics *
    v_trig_angle_scale;


  IF mod(
       v_min_trig_numerator,
       v_physics_scale
     ) <> 0
     OR mod(
          v_max_trig_numerator,
          v_physics_scale
        ) <> 0
     OR mod(
          v_step_trig_numerator,
          v_physics_scale
        ) <> 0
  THEN
    RETURN false;
  END IF;


  RETURN true;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_trig_representation_v1(
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_trig_representation_v1(
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_trig_representation_v1(
    jsonb
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_trig_representation_v1(
    jsonb
  )
FROM service_role;


-- =====================================================
-- EXTEND CURRENT PUBLIC V2 VALIDATOR
--
-- Current public validator already owns:
--
--   original V2 contract
--   angle_step_deg
--   angle-grid validation
--
-- Rename it to private core, then remove ONLY the two
-- newly introduced trig keys before delegating.
-- =====================================================

ALTER FUNCTION
  public.cing_artillery_validate_physics_rules_v2(
    jsonb
  )
RENAME TO
  cing_artillery_validate_physics_rules_v2_pre_trig_representation;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_trig_representation(
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_trig_representation(
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_trig_representation(
    jsonb
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_trig_representation(
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
            'trig_angle_scale'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'trig_value_scale'
        ) <> 'number'
  THEN
    RETURN false;
  END IF;


  IF NOT
    public.cing_artillery_validate_physics_rules_v2_pre_trig_representation(
      (
        p_rules -
          'trig_angle_scale'
      ) -
        'trig_value_scale'
    )
  THEN
    RETURN false;
  END IF;


  RETURN
    public.cing_artillery_validate_trig_representation_v1(
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


-- =====================================================
-- SHOT ACCEPTANCE REVALIDATION
--
-- Existing public shot wrapper already owns:
--
--   established shot acceptance
--   Rules V1 compatibility
--   V2 angle-grid shot membership
--
-- Rename that wrapper to private core.
--
-- New public wrapper calls it first, then for Rules V2
-- revalidates the FULL immutable V2 rules contract.
--
-- Failure raises inside the same transaction and therefore
-- rolls back any newly accepted command.
-- =====================================================

ALTER FUNCTION
  public.cing_artillery_accept_shot_command_atomic(
    uuid,
    uuid,
    uuid,
    integer,
    uuid,
    numeric,
    numeric
  )
RENAME TO
  cing_artillery_accept_shot_command_atomic_pre_trig_representation;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic_pre_trig_representation(
    uuid,
    uuid,
    uuid,
    integer,
    uuid,
    numeric,
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic_pre_trig_representation(
    uuid,
    uuid,
    uuid,
    integer,
    uuid,
    numeric,
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic_pre_trig_representation(
    uuid,
    uuid,
    uuid,
    integer,
    uuid,
    numeric,
    numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic_pre_trig_representation(
    uuid,
    uuid,
    uuid,
    integer,
    uuid,
    numeric,
    numeric
  )
FROM service_role;


CREATE OR REPLACE FUNCTION
  public.cing_artillery_accept_shot_command_atomic(
    p_combat_state_id uuid,
    p_shooter_account_id uuid,
    p_shooter_session_id uuid,
    p_turn_number integer,
    p_command_id uuid,
    p_angle_deg numeric,
    p_power numeric
  )
RETURNS public.cing_artillery_shot_commands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_command
    public.cing_artillery_shot_commands%ROWTYPE;

  v_rules jsonb;

  v_rules_version integer;
BEGIN
  v_command :=
    public.cing_artillery_accept_shot_command_atomic_pre_trig_representation(
      p_combat_state_id,
      p_shooter_account_id,
      p_shooter_session_id,
      p_turn_number,
      p_command_id,
      p_angle_deg,
      p_power
    );


  IF v_command.id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_COMMAND_MISSING_AFTER_ACCEPT';
  END IF;


  SELECT
    c.rules_snapshot
  INTO
    v_rules
  FROM public.cing_artillery_combat_states AS c
  WHERE c.id =
    v_command.combat_state_id;


  IF NOT FOUND
     OR v_rules IS NULL
     OR jsonb_typeof(
          v_rules
        ) <> 'object'
     OR jsonb_typeof(
          v_rules ->
            'version'
        ) <> 'number'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_RULES_INVALID';
  END IF;


  BEGIN
    v_rules_version :=
      (
        v_rules ->>
          'version'
      )::integer;
  EXCEPTION
    WHEN invalid_text_representation
      OR numeric_value_out_of_range
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_SHOT_RULES_INVALID';
  END;


  IF v_rules_version = 1 THEN
    RETURN v_command;
  END IF;


  IF v_rules_version <> 2 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_RULES_VERSION_UNSUPPORTED';
  END IF;


  IF NOT
    public.cing_artillery_validate_physics_rules_v2(
      v_rules
    )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_RULES_V2_INVALID';
  END IF;


  RETURN v_command;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic(
    uuid,
    uuid,
    uuid,
    integer,
    uuid,
    numeric,
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic(
    uuid,
    uuid,
    uuid,
    integer,
    uuid,
    numeric,
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic(
    uuid,
    uuid,
    uuid,
    integer,
    uuid,
    numeric,
    numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic(
    uuid,
    uuid,
    uuid,
    integer,
    uuid,
    numeric,
    numeric
  )
FROM service_role;


GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic(
    uuid,
    uuid,
    uuid,
    integer,
    uuid,
    numeric,
    numeric
  )
TO service_role;


COMMIT;
