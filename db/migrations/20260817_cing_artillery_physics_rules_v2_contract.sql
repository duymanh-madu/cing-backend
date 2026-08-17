BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- PHYSICS RULES V2 CONTRACT
--
-- This migration defines SHAPE + semantic invariants only.
--
-- It does NOT:
--
--   activate rules version 2
--   mutate app_configs
--   choose/tune gameplay values
--   rewrite existing combat snapshots
--   calculate physics
--   mutate gameplay state
--
-- Existing rules V1 remains untouched.
--
-- A later publication/activation authority will supply an
-- explicit reviewed V2 rules object and must validate it
-- through this function before making it canonical.
-- =====================================================


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
  v_allowed_keys constant text[] :=
    ARRAY[
      'version',
      'physics_version',

      'max_hp',
      'turn_duration_ms',

      'gravity',
      'wind_min',
      'wind_max',

      'angle_min_deg',
      'angle_max_deg',

      'power_min',
      'power_max',
      'power_velocity_scale',

      'physics_step_ms',
      'max_flight_time_ms',
      'physics_fixed_scale',

      'projectile_radius_px',

      'player_hit_radius_px',
      'player_hit_center_offset_y_px',

      'muzzle_offset_forward_px',
      'muzzle_offset_up_px',

      'base_damage',
      'blast_radius',
      'blast_min_damage_ratio',

      'damage_formula_version',
      'damage_rounding',

      'self_damage_enabled'
    ];

  v_required_keys constant text[] :=
    ARRAY[
      'version',
      'physics_version',

      'max_hp',
      'turn_duration_ms',

      'gravity',
      'wind_min',
      'wind_max',

      'angle_min_deg',
      'angle_max_deg',

      'power_min',
      'power_max',
      'power_velocity_scale',

      'physics_step_ms',
      'max_flight_time_ms',
      'physics_fixed_scale',

      'projectile_radius_px',

      'player_hit_radius_px',
      'player_hit_center_offset_y_px',

      'muzzle_offset_forward_px',
      'muzzle_offset_up_px',

      'base_damage',
      'blast_radius',
      'blast_min_damage_ratio',

      'damage_formula_version',
      'damage_rounding',

      'self_damage_enabled'
    ];

  v_key text;

  v_version integer;
  v_physics_version integer;

  v_max_hp numeric;
  v_turn_duration_ms integer;

  v_gravity numeric;
  v_wind_min numeric;
  v_wind_max numeric;

  v_angle_min numeric;
  v_angle_max numeric;

  v_power_min numeric;
  v_power_max numeric;
  v_power_velocity_scale numeric;

  v_physics_step_ms integer;
  v_max_flight_time_ms integer;
  v_physics_fixed_scale integer;

  v_projectile_radius numeric;

  v_player_hit_radius numeric;
  v_player_hit_center_offset_y numeric;

  v_muzzle_offset_forward numeric;
  v_muzzle_offset_up numeric;

  v_base_damage numeric;
  v_blast_radius numeric;
  v_blast_min_damage_ratio numeric;

  v_damage_formula_version integer;
  v_damage_rounding text;

  v_self_damage_enabled boolean;
BEGIN
  IF jsonb_typeof(p_rules) <> 'object' THEN
    RETURN false;
  END IF;


  -- ===================================================
  -- EXACT KEYSET
  --
  -- Unknown keys fail closed so a caller cannot believe a
  -- gameplay field became canonical while PostgreSQL
  -- silently ignores it.
  -- ===================================================

  FOREACH v_key IN ARRAY v_required_keys
  LOOP
    IF NOT (p_rules ? v_key) THEN
      RETURN false;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_rules) AS supplied(key)
    WHERE NOT (
      supplied.key =
      ANY(v_allowed_keys)
    )
  ) THEN
    RETURN false;
  END IF;


  -- ===================================================
  -- JSON TYPES
  -- ===================================================

  IF jsonb_typeof(p_rules -> 'version') <> 'number'
     OR jsonb_typeof(p_rules -> 'physics_version') <> 'number'

     OR jsonb_typeof(p_rules -> 'max_hp') <> 'number'
     OR jsonb_typeof(p_rules -> 'turn_duration_ms') <> 'number'

     OR jsonb_typeof(p_rules -> 'gravity') <> 'number'
     OR jsonb_typeof(p_rules -> 'wind_min') <> 'number'
     OR jsonb_typeof(p_rules -> 'wind_max') <> 'number'

     OR jsonb_typeof(p_rules -> 'angle_min_deg') <> 'number'
     OR jsonb_typeof(p_rules -> 'angle_max_deg') <> 'number'

     OR jsonb_typeof(p_rules -> 'power_min') <> 'number'
     OR jsonb_typeof(p_rules -> 'power_max') <> 'number'
     OR jsonb_typeof(p_rules -> 'power_velocity_scale') <> 'number'

     OR jsonb_typeof(p_rules -> 'physics_step_ms') <> 'number'
     OR jsonb_typeof(p_rules -> 'max_flight_time_ms') <> 'number'
     OR jsonb_typeof(p_rules -> 'physics_fixed_scale') <> 'number'

     OR jsonb_typeof(p_rules -> 'projectile_radius_px') <> 'number'

     OR jsonb_typeof(p_rules -> 'player_hit_radius_px') <> 'number'
     OR jsonb_typeof(
          p_rules -> 'player_hit_center_offset_y_px'
        ) <> 'number'

     OR jsonb_typeof(
          p_rules -> 'muzzle_offset_forward_px'
        ) <> 'number'
     OR jsonb_typeof(
          p_rules -> 'muzzle_offset_up_px'
        ) <> 'number'

     OR jsonb_typeof(p_rules -> 'base_damage') <> 'number'
     OR jsonb_typeof(p_rules -> 'blast_radius') <> 'number'
     OR jsonb_typeof(
          p_rules -> 'blast_min_damage_ratio'
        ) <> 'number'

     OR jsonb_typeof(
          p_rules -> 'damage_formula_version'
        ) <> 'number'
     OR jsonb_typeof(p_rules -> 'damage_rounding') <> 'string'

     OR jsonb_typeof(
          p_rules -> 'self_damage_enabled'
        ) <> 'boolean'
  THEN
    RETURN false;
  END IF;


  -- ===================================================
  -- EXACT INTEGER DOMAINS
  -- ===================================================

  IF (p_rules ->> 'version') !~ '^[1-9][0-9]*$'
     OR (p_rules ->> 'physics_version') !~ '^[1-9][0-9]*$'
     OR (p_rules ->> 'turn_duration_ms') !~ '^[1-9][0-9]*$'
     OR (p_rules ->> 'physics_step_ms') !~ '^[1-9][0-9]*$'
     OR (p_rules ->> 'max_flight_time_ms') !~ '^[1-9][0-9]*$'
     OR (p_rules ->> 'physics_fixed_scale') !~ '^[1-9][0-9]*$'
     OR (p_rules ->> 'damage_formula_version') !~ '^[1-9][0-9]*$'
  THEN
    RETURN false;
  END IF;

  BEGIN
    v_version :=
      (p_rules ->> 'version')::integer;

    v_physics_version :=
      (p_rules ->> 'physics_version')::integer;

    v_turn_duration_ms :=
      (p_rules ->> 'turn_duration_ms')::integer;

    v_physics_step_ms :=
      (p_rules ->> 'physics_step_ms')::integer;

    v_max_flight_time_ms :=
      (p_rules ->> 'max_flight_time_ms')::integer;

    v_physics_fixed_scale :=
      (p_rules ->> 'physics_fixed_scale')::integer;

    v_damage_formula_version :=
      (p_rules ->> 'damage_formula_version')::integer;
  EXCEPTION
    WHEN invalid_text_representation
      OR numeric_value_out_of_range
    THEN
      RETURN false;
  END;


  -- ===================================================
  -- VERSION IDENTITY
  --
  -- This function defines exactly:
  --
  --   rules version   = 2
  --   physics version = 1
  --   damage formula  = 1
  --
  -- Any later semantic change must receive a new version.
  -- ===================================================

  IF v_version <> 2
     OR v_physics_version <> 1
     OR v_damage_formula_version <> 1
  THEN
    RETURN false;
  END IF;


  -- ===================================================
  -- NUMERIC PARSING
  -- ===================================================

  BEGIN
    v_max_hp :=
      (p_rules ->> 'max_hp')::numeric;

    v_gravity :=
      (p_rules ->> 'gravity')::numeric;

    v_wind_min :=
      (p_rules ->> 'wind_min')::numeric;

    v_wind_max :=
      (p_rules ->> 'wind_max')::numeric;

    v_angle_min :=
      (p_rules ->> 'angle_min_deg')::numeric;

    v_angle_max :=
      (p_rules ->> 'angle_max_deg')::numeric;

    v_power_min :=
      (p_rules ->> 'power_min')::numeric;

    v_power_max :=
      (p_rules ->> 'power_max')::numeric;

    v_power_velocity_scale :=
      (p_rules ->> 'power_velocity_scale')::numeric;

    v_projectile_radius :=
      (p_rules ->> 'projectile_radius_px')::numeric;

    v_player_hit_radius :=
      (p_rules ->> 'player_hit_radius_px')::numeric;

    v_player_hit_center_offset_y :=
      (
        p_rules ->>
          'player_hit_center_offset_y_px'
      )::numeric;

    v_muzzle_offset_forward :=
      (
        p_rules ->>
          'muzzle_offset_forward_px'
      )::numeric;

    v_muzzle_offset_up :=
      (
        p_rules ->>
          'muzzle_offset_up_px'
      )::numeric;

    v_base_damage :=
      (p_rules ->> 'base_damage')::numeric;

    v_blast_radius :=
      (p_rules ->> 'blast_radius')::numeric;

    v_blast_min_damage_ratio :=
      (
        p_rules ->>
          'blast_min_damage_ratio'
      )::numeric;

    v_damage_rounding :=
      p_rules ->> 'damage_rounding';

    v_self_damage_enabled :=
      (
        p_rules ->>
          'self_damage_enabled'
      )::boolean;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN false;
  END;


  -- ===================================================
  -- FINITE NUMERIC AUTHORITY
  -- ===================================================

  IF v_max_hp IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR v_gravity IN (
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
     OR v_angle_min IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR v_angle_max IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR v_power_min IN (
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
     OR v_projectile_radius IN (
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
     OR v_muzzle_offset_forward IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR v_muzzle_offset_up IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR v_base_damage IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR v_blast_radius IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR v_blast_min_damage_ratio IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
  THEN
    RETURN false;
  END IF;


  -- ===================================================
  -- GENERAL GAMEPLAY INVARIANTS
  -- ===================================================

  IF v_max_hp <= 0
     OR v_turn_duration_ms <= 0

     OR v_gravity <= 0
     OR v_wind_min > v_wind_max

     OR v_angle_min > v_angle_max

     OR v_power_min < 0
     OR v_power_min > v_power_max
     OR v_power_velocity_scale <= 0

     OR v_physics_step_ms <= 0
     OR v_max_flight_time_ms <= v_physics_step_ms

     -- Fixed-step solver must end on an exact step.
     OR (
       v_max_flight_time_ms %
       v_physics_step_ms
     ) <> 0

     OR v_physics_fixed_scale <= 0

     OR v_projectile_radius <= 0

     OR v_player_hit_radius <= 0

     -- Spawn is ground-contact; collider center is above it.
     OR v_player_hit_center_offset_y <= 0

     OR v_muzzle_offset_forward < 0
     OR v_muzzle_offset_up <= 0

     OR v_base_damage <= 0
     OR v_blast_radius <= 0

     OR v_blast_min_damage_ratio <= 0
     OR v_blast_min_damage_ratio > 1
  THEN
    RETURN false;
  END IF;


  -- Projectile/body geometry must remain physically usable.
  IF v_projectile_radius >=
       v_player_hit_radius
  THEN
    RETURN false;
  END IF;


  -- ===================================================
  -- DAMAGE V1 SEMANTICS
  --
  -- Deterministic integer HP mutation uses one explicit
  -- rounding rule.
  --
  -- Self damage remains disabled in Physics V1 so one shot
  -- cannot produce an undefined V1 double-KO path.
  -- ===================================================

  IF v_damage_rounding <> 'floor'
     OR v_self_damage_enabled <> false
  THEN
    RETURN false;
  END IF;


  RETURN true;
END;
$$;


-- =====================================================
-- PRIVATE VALIDATOR ACL
--
-- No application role invokes this directly.
--
-- Future canonical rule publication / combat authority may
-- call it internally from PostgreSQL.
-- =====================================================

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
