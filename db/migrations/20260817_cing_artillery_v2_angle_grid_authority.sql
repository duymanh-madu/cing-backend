BEGIN;

-- =====================================================
-- CING ARTILLERY — PHYSICS V2 ANGLE GRID AUTHORITY V1
--
-- Dependency order:
--
--   shot_command_authority
--   shot_execution_foundation
--   physics_rules_v2_contract
--     ->
--   THIS MIGRATION
--
-- Rules V2 gains:
--
--   angle_step_deg
--
-- Canonical V2 angle:
--
--   angle_min_deg + N * angle_step_deg
--
-- Every configured/input angle must also lie exactly on
-- physics_fixed_scale.
--
-- No implicit rounding.
--
-- Existing Rules V1 behavior remains unchanged.
--
-- No V2 activation occurs here.
-- =====================================================


-- =====================================================
-- PRIVATE ANGLE GRID VALIDATOR
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_validate_angle_grid_v1(
    p_rules jsonb,
    p_angle_deg numeric
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_angle_min numeric;
  v_angle_max numeric;
  v_angle_step numeric;

  v_fixed_scale integer;

  v_min_scaled numeric;
  v_max_scaled numeric;
  v_step_scaled numeric;

  v_angle_scaled numeric;
BEGIN
  IF p_rules IS NULL
     OR jsonb_typeof(
          p_rules
        ) <> 'object'
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
     OR jsonb_typeof(
          p_rules ->
            'physics_fixed_scale'
        ) <> 'number'
  THEN
    RETURN false;
  END IF;


  IF (
    p_rules ->
      'physics_fixed_scale'
  )::text !~ '^[1-9][0-9]*$'
  THEN
    RETURN false;
  END IF;


  BEGIN
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

    v_fixed_scale :=
      (
        p_rules ->>
          'physics_fixed_scale'
      )::integer;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN false;
  END;


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
     OR v_angle_step <= 0
     OR v_angle_max <
        v_angle_min
     OR v_fixed_scale <= 0
  THEN
    RETURN false;
  END IF;


  v_min_scaled :=
    v_angle_min *
    v_fixed_scale;

  v_max_scaled :=
    v_angle_max *
    v_fixed_scale;

  v_step_scaled :=
    v_angle_step *
    v_fixed_scale;


  -- Exact fixed-point representation only.
  IF v_min_scaled <>
       trunc(v_min_scaled)
     OR v_max_scaled <>
       trunc(v_max_scaled)
     OR v_step_scaled <>
       trunc(v_step_scaled)
     OR v_step_scaled <= 0
  THEN
    RETURN false;
  END IF;


  -- The configured maximum must itself be a grid point.
  IF mod(
       v_max_scaled -
         v_min_scaled,
       v_step_scaled
     ) <> 0
  THEN
    RETURN false;
  END IF;


  -- NULL validates rules-grid shape only.
  IF p_angle_deg IS NULL THEN
    RETURN true;
  END IF;


  IF p_angle_deg IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
  THEN
    RETURN false;
  END IF;


  v_angle_scaled :=
    p_angle_deg *
    v_fixed_scale;


  IF v_angle_scaled <>
       trunc(v_angle_scaled)
     OR v_angle_scaled <
        v_min_scaled
     OR v_angle_scaled >
        v_max_scaled
     OR mod(
          v_angle_scaled -
            v_min_scaled,
          v_step_scaled
        ) <> 0
  THEN
    RETURN false;
  END IF;


  RETURN true;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_angle_grid_v1(
    jsonb,
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_angle_grid_v1(
    jsonb,
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_angle_grid_v1(
    jsonb,
    numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_angle_grid_v1(
    jsonb,
    numeric
  )
FROM service_role;


-- =====================================================
-- EXTEND THE EXISTING PHYSICS V2 VALIDATOR
--
-- Do not duplicate/rewrite the established validator.
--
-- Rename it to a private core, then delegate to it after
-- removing only the newly introduced angle_step_deg key.
-- =====================================================

ALTER FUNCTION
  public.cing_artillery_validate_physics_rules_v2(
    jsonb
  )
RENAME TO
  cing_artillery_validate_physics_rules_v2_pre_angle_grid;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_angle_grid(
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_angle_grid(
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_angle_grid(
    jsonb
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_angle_grid(
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
     OR NOT (
       p_rules ?
         'angle_step_deg'
     )
     OR jsonb_typeof(
          p_rules ->
            'angle_step_deg'
        ) <> 'number'
  THEN
    RETURN false;
  END IF;


  IF NOT
    public.cing_artillery_validate_physics_rules_v2_pre_angle_grid(
      p_rules -
        'angle_step_deg'
    )
  THEN
    RETURN false;
  END IF;


  RETURN
    public.cing_artillery_validate_angle_grid_v1(
      p_rules,
      NULL
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
-- SHOT ACCEPTANCE EXTENSION
--
-- Preserve the established shot authority completely.
--
-- Existing function becomes a private SECURITY DEFINER
-- core.
--
-- The new public-name wrapper invokes that core first.
--
-- The core still owns:
--
--   feature gate
--   combat -> turn lock ordering
--   shooter/session authority
--   turn number
--   PostgreSQL deadline
--   immutable range checks
--   idempotency
--   durable INSERT
--
-- If V2 angle-grid validation fails afterward, RAISE
-- aborts this same transaction and rolls back the INSERT.
--
-- service_role cannot execute the renamed core directly.
--
-- The existing accept+execution function calls the public
-- function name dynamically and therefore flows through
-- this wrapper without being rewritten.
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
  cing_artillery_accept_shot_command_atomic_pre_angle_grid;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic_pre_angle_grid(
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
  public.cing_artillery_accept_shot_command_atomic_pre_angle_grid(
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
  public.cing_artillery_accept_shot_command_atomic_pre_angle_grid(
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
  public.cing_artillery_accept_shot_command_atomic_pre_angle_grid(
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
    public.cing_artillery_accept_shot_command_atomic_pre_angle_grid(
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
    public.cing_artillery_validate_angle_grid_v1(
      v_rules,
      v_command.angle_deg
    )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_ANGLE_NOT_ON_GRID';
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
