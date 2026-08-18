BEGIN;

CREATE OR REPLACE FUNCTION
  public.cing_artillery_validate_collision_geometry_numeric_v1(
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

  v_projectile_radius numeric;
  v_player_hit_radius numeric;
  v_player_hit_center_offset_y numeric;

  v_projectile_radius_scaled numeric;
  v_player_hit_radius_scaled numeric;
  v_player_hit_center_offset_y_scaled numeric;

  v_max_safe_scaled_magnitude constant numeric :=
    9007199254740991;
BEGIN
  IF jsonb_typeof(p_rules) <> 'object'
     OR jsonb_typeof(p_rules -> 'physics_version') <> 'number'
     OR jsonb_typeof(p_rules -> 'physics_fixed_scale') <> 'number'
     OR jsonb_typeof(p_rules -> 'projectile_radius_px') <> 'number'
     OR jsonb_typeof(p_rules -> 'player_hit_radius_px') <> 'number'
     OR jsonb_typeof(
          p_rules -> 'player_hit_center_offset_y_px'
        ) <> 'number'
  THEN
    RETURN false;
  END IF;

  IF (
       p_rules ->> 'physics_version'
     ) !~ '^[1-9][0-9]*$'
     OR (
       p_rules ->> 'physics_fixed_scale'
     ) !~ '^[1-9][0-9]*$'
  THEN
    RETURN false;
  END IF;

  BEGIN
    v_physics_version :=
      (
        p_rules ->> 'physics_version'
      )::integer;

    v_physics_fixed_scale :=
      (
        p_rules ->> 'physics_fixed_scale'
      )::integer;

    v_projectile_radius :=
      (
        p_rules ->> 'projectile_radius_px'
      )::numeric;

    v_player_hit_radius :=
      (
        p_rules ->> 'player_hit_radius_px'
      )::numeric;

    v_player_hit_center_offset_y :=
      (
        p_rules ->>
          'player_hit_center_offset_y_px'
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

  IF v_projectile_radius IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR v_player_hit_radius IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR v_player_hit_center_offset_y IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
  THEN
    RETURN false;
  END IF;

  IF v_projectile_radius <= 0
     OR v_player_hit_radius <= 0
     OR v_player_hit_center_offset_y <= 0
  THEN
    RETURN false;
  END IF;

  v_projectile_radius_scaled :=
    v_projectile_radius *
    v_physics_fixed_scale;

  v_player_hit_radius_scaled :=
    v_player_hit_radius *
    v_physics_fixed_scale;

  v_player_hit_center_offset_y_scaled :=
    v_player_hit_center_offset_y *
    v_physics_fixed_scale;

  IF trunc(v_projectile_radius_scaled) <>
       v_projectile_radius_scaled
     OR trunc(v_player_hit_radius_scaled) <>
        v_player_hit_radius_scaled
     OR trunc(v_player_hit_center_offset_y_scaled) <>
        v_player_hit_center_offset_y_scaled
  THEN
    RETURN false;
  END IF;

  IF v_projectile_radius_scaled >
       v_max_safe_scaled_magnitude
     OR v_player_hit_radius_scaled >
        v_max_safe_scaled_magnitude
     OR v_player_hit_center_offset_y_scaled >
        v_max_safe_scaled_magnitude
  THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_collision_geometry_numeric_v1(
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_collision_geometry_numeric_v1(
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_collision_geometry_numeric_v1(
    jsonb
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_collision_geometry_numeric_v1(
    jsonb
  )
FROM service_role;


ALTER FUNCTION
  public.cing_artillery_validate_physics_rules_v2(
    jsonb
  )
RENAME TO
  cing_artillery_validate_physics_rules_v2_pre_collision_geometry_numeric_v1;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_collision_geometry_numeric_v1(
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_collision_geometry_numeric_v1(
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_collision_geometry_numeric_v1(
    jsonb
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_physics_rules_v2_pre_collision_geometry_numeric_v1(
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
    public.cing_artillery_validate_physics_rules_v2_pre_collision_geometry_numeric_v1(
      p_rules
    )
    IS NOT TRUE
  THEN
    RETURN false;
  END IF;

  IF
    public.cing_artillery_validate_collision_geometry_numeric_v1(
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
