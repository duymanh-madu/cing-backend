BEGIN;

-- =====================================================
-- CING ARTILLERY — POWER NUMERIC AUTHORITY V1
--
-- Physics V1 power values are canonical only when:
--
--   power_min
--   power_max
--   power_velocity_scale
--   accepted shot power
--
-- are exactly representable on physics_fixed_scale.
--
-- No implicit numeric rounding.
--
-- There is intentionally no power-step field in V1.
--
-- Therefore every exact physics-lattice value inside the
-- configured power range is canonical.
--
-- This migration:
--
--   extends Rules V2 validation
--   extends V2 shot acceptance validation
--
-- It does NOT:
--
--   calculate initial velocity
--   calculate trajectory
--   activate Rules V2
--   mutate DB gameplay state
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.cing_artillery_validate_power_numeric_v1(
    p_rules jsonb,
    p_power numeric DEFAULT NULL
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

  v_power_min numeric;
  v_power_max numeric;
  v_power_velocity_scale numeric;

  v_power_scaled numeric;
BEGIN
  /*
   * p_power = NULL intentionally means:
   *
   *   validate rules only.
   *
   * Therefore this function must be CALLED ON NULL INPUT.
   *
   * p_rules itself is always mandatory and any missing rules
   * object fails closed explicitly.
   */
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
            'power_min'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'power_max'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules ->
            'power_velocity_scale'
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

    v_power_min :=
      (
        p_rules ->>
          'power_min'
      )::numeric;

    v_power_max :=
      (
        p_rules ->>
          'power_max'
      )::numeric;

    v_power_velocity_scale :=
      (
        p_rules ->>
          'power_velocity_scale'
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


  IF v_power_min IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR v_power_max IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR v_power_velocity_scale IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
  THEN
    RETURN false;
  END IF;


  IF v_power_min < 0
     OR v_power_max < v_power_min
     OR v_power_velocity_scale <= 0
  THEN
    RETURN false;
  END IF;


  IF trunc(
       v_power_min *
       v_physics_fixed_scale
     ) <>
     (
       v_power_min *
       v_physics_fixed_scale
     )
     OR trunc(
       v_power_max *
       v_physics_fixed_scale
     ) <>
     (
       v_power_max *
       v_physics_fixed_scale
     )
     OR trunc(
       v_power_velocity_scale *
       v_physics_fixed_scale
     ) <>
     (
       v_power_velocity_scale *
       v_physics_fixed_scale
     )
  THEN
    RETURN false;
  END IF;


  IF p_power IS NULL THEN
    RETURN true;
  END IF;


  IF p_power IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
  THEN
    RETURN false;
  END IF;


  IF p_power < v_power_min
     OR p_power > v_power_max
  THEN
    RETURN false;
  END IF;


  v_power_scaled :=
    p_power *
    v_physics_fixed_scale;


  RETURN
    trunc(
      v_power_scaled
    ) =
    v_power_scaled;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_power_numeric_v1(
    jsonb,
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_power_numeric_v1(
    jsonb,
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_power_numeric_v1(
    jsonb,
    numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_power_numeric_v1(
    jsonb,
    numeric
  )
FROM service_role;


ALTER FUNCTION
  public.cing_artillery_validate_physics_rules_v2(
    jsonb
  )
RENAME TO
  cing_artillery_validate_physics_rules_v2_pre_power_numeric_v1;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_power_numeric_v1(
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_power_numeric_v1(
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_power_numeric_v1(
    jsonb
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_power_numeric_v1(
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
    public.cing_artillery_validate_physics_rules_v2_pre_power_numeric_v1(
      p_rules
    )
  THEN
    RETURN false;
  END IF;


  IF
    public.cing_artillery_validate_power_numeric_v1(
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
  cing_artillery_accept_shot_command_atomic_pre_power_numeric_v1;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_atomic_pre_power_numeric_v1(
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
  public.cing_artillery_accept_shot_command_atomic_pre_power_numeric_v1(
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
  public.cing_artillery_accept_shot_command_atomic_pre_power_numeric_v1(
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
  public.cing_artillery_accept_shot_command_atomic_pre_power_numeric_v1(
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
    public.cing_artillery_accept_shot_command_atomic_pre_power_numeric_v1(
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


  IF
    public.cing_artillery_validate_power_numeric_v1(
      v_rules,
      v_command.power
    )
    IS NOT TRUE
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_POWER_NOT_CANONICAL';
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
