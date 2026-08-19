BEGIN;


/*
 * =====================================================
 * CING PIU PIU / CING ARTILLERY
 * DAMAGE RULES RATIONAL SNAPSHOT V1
 * =====================================================
 *
 * Problem:
 *
 * PostgreSQL JSONB numeric authority and ECMAScript Number
 * do not necessarily preserve the same decimal identity.
 *
 * Damage Formula V1 must therefore not depend on a future
 * reinterpretation of immutable rules_snapshot through a
 * JavaScript Number.
 *
 * Authority introduced here:
 *
 *   immutable rules_snapshot
 *          |
 *          v
 *   exact PostgreSQL NUMERIC decimal
 *          |
 *          v
 *   reduced integer rational
 *          |
 *          v
 *   damage_rules_rational_snapshot
 *
 * Numerators and denominators are stored as canonical base-10
 * strings so JavaScript BigInt consumers can later consume them
 * without JSON Number precision loss.
 *
 * Rules V1:
 *   damage_rules_rational_snapshot = NULL
 *
 * Rules V2:
 *   exact immutable rational snapshot is mandatory.
 *
 * This migration does NOT:
 *
 *   activate Rules V2
 *   mutate app_configs
 *   rewrite the combat initializer
 *   alter player stat snapshots
 *   calculate shot damage
 *   mutate HP
 *   mutate resolution state
 *   expose private mathematical functions
 */


/*
 * Exact PostgreSQL NUMERIC -> reduced integer rational.
 *
 * No floating point.
 * No arbitrary gameplay scale.
 * No rounding.
 *
 * scale(NUMERIC) defines the exact stored decimal scale.
 * The denominator is built as exact integer 10^scale using
 * repeated integer multiplication.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_numeric_to_reduced_rational_private_v1(
    p_value numeric
  )
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_scale integer;

  v_numerator numeric;
  v_denominator numeric;

  v_gcd numeric;

  v_i integer;
BEGIN
  IF p_value IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_DAMAGE_RATIONAL_DECIMAL_INVALID';
  END IF;


  IF p_value = 0
  THEN
    RETURN jsonb_build_object(
      'numerator',
        '0',
      'denominator',
        '1'
    );
  END IF;


  v_scale :=
    scale(
      p_value
    );


  IF v_scale < 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_DAMAGE_RATIONAL_SCALE_INVALID';
  END IF;


  v_denominator :=
    1;


  IF v_scale > 0
  THEN
    FOR v_i IN
      1..v_scale
    LOOP
      v_denominator :=
        v_denominator *
        10;
    END LOOP;
  END IF;


  v_numerator :=
    p_value *
    v_denominator;


  IF v_numerator <>
       trunc(
         v_numerator
       )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_DAMAGE_RATIONAL_NUMERATOR_INVALID';
  END IF;


  v_gcd :=
    public.cing_artillery_gcd_numeric_private_v1(
      v_numerator,
      v_denominator
    );


  IF v_gcd IS NULL
     OR v_gcd <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_DAMAGE_RATIONAL_GCD_INVALID';
  END IF;


  v_numerator :=
    div(
      v_numerator,
      v_gcd
    );

  v_denominator :=
    div(
      v_denominator,
      v_gcd
    );


  IF v_denominator <= 0
     OR v_numerator <>
        trunc(
          v_numerator
        )
     OR v_denominator <>
        trunc(
          v_denominator
        )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_DAMAGE_RATIONAL_REDUCTION_INVALID';
  END IF;


  RETURN jsonb_build_object(
    'numerator',
      v_numerator::text,
    'denominator',
      v_denominator::text
  );
END;
$$;


/*
 * Validate the durable rational snapshot independently of the
 * builder. Writer authority may reuse this validator later.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_validate_damage_rules_rational_snapshot_private_v1(
    p_snapshot jsonb
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
      'rules_version',

      'base_damage_numerator',
      'base_damage_denominator',

      'blast_min_damage_ratio_numerator',
      'blast_min_damage_ratio_denominator',

      'damage_formula_version',
      'damage_rounding',
      'self_damage_enabled'
    ];

  v_actual_key_count integer;

  v_base_numerator numeric;
  v_base_denominator numeric;

  v_ratio_numerator numeric;
  v_ratio_denominator numeric;
BEGIN
  IF jsonb_typeof(
       p_snapshot
     ) <> 'object'
  THEN
    RETURN false;
  END IF;


  SELECT
    count(*)
  INTO
    v_actual_key_count
  FROM jsonb_object_keys(
    p_snapshot
  );


  IF v_actual_key_count <>
       cardinality(
         v_allowed_keys
       )
     OR EXISTS (
          SELECT 1
          FROM jsonb_object_keys(
            p_snapshot
          ) AS k(key)
          WHERE NOT (
            k.key =
            ANY(
              v_allowed_keys
            )
          )
        )
  THEN
    RETURN false;
  END IF;


  IF jsonb_typeof(
       p_snapshot -> 'version'
     ) <> 'number'
     OR p_snapshot ->> 'version' <>
        '1'

     OR jsonb_typeof(
          p_snapshot -> 'rules_version'
        ) <> 'number'
     OR p_snapshot ->> 'rules_version' <>
        '2'

     OR jsonb_typeof(
          p_snapshot ->
            'base_damage_numerator'
        ) <> 'string'
     OR jsonb_typeof(
          p_snapshot ->
            'base_damage_denominator'
        ) <> 'string'

     OR jsonb_typeof(
          p_snapshot ->
            'blast_min_damage_ratio_numerator'
        ) <> 'string'
     OR jsonb_typeof(
          p_snapshot ->
            'blast_min_damage_ratio_denominator'
        ) <> 'string'

     OR jsonb_typeof(
          p_snapshot ->
            'damage_formula_version'
        ) <> 'number'
     OR p_snapshot ->>
          'damage_formula_version' <>
        '1'

     OR jsonb_typeof(
          p_snapshot ->
            'damage_rounding'
        ) <> 'string'
     OR p_snapshot ->>
          'damage_rounding' <>
        'floor'

     OR jsonb_typeof(
          p_snapshot ->
            'self_damage_enabled'
        ) <> 'boolean'
     OR (
          p_snapshot ->>
            'self_damage_enabled'
        )::boolean <>
        false
  THEN
    RETURN false;
  END IF;


  IF (
       p_snapshot ->>
         'base_damage_numerator'
     ) !~ '^[1-9][0-9]*$'
     OR (
          p_snapshot ->>
            'base_damage_denominator'
        ) !~ '^[1-9][0-9]*$'
     OR (
          p_snapshot ->>
            'blast_min_damage_ratio_numerator'
        ) !~ '^[1-9][0-9]*$'
     OR (
          p_snapshot ->>
            'blast_min_damage_ratio_denominator'
        ) !~ '^[1-9][0-9]*$'
  THEN
    RETURN false;
  END IF;


  BEGIN
    v_base_numerator :=
      (
        p_snapshot ->>
          'base_damage_numerator'
      )::numeric;

    v_base_denominator :=
      (
        p_snapshot ->>
          'base_damage_denominator'
      )::numeric;

    v_ratio_numerator :=
      (
        p_snapshot ->>
          'blast_min_damage_ratio_numerator'
      )::numeric;

    v_ratio_denominator :=
      (
        p_snapshot ->>
          'blast_min_damage_ratio_denominator'
      )::numeric;
  EXCEPTION
    WHEN invalid_text_representation
      OR numeric_value_out_of_range
    THEN
      RETURN false;
  END;


  IF v_base_numerator <= 0
     OR v_base_denominator <= 0

     OR v_ratio_numerator <= 0
     OR v_ratio_denominator <= 0

     OR v_ratio_numerator >
        v_ratio_denominator

     OR public.cing_artillery_gcd_numeric_private_v1(
          v_base_numerator,
          v_base_denominator
        ) <> 1

     OR public.cing_artillery_gcd_numeric_private_v1(
          v_ratio_numerator,
          v_ratio_denominator
        ) <> 1
  THEN
    RETURN false;
  END IF;


  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;


/*
 * Build canonical V2 damage-rule rational snapshot.
 *
 * Rules V1 deliberately returns NULL because V1 does not own
 * the complete Damage Formula V1 rule contract.
 *
 * Any unsupported future rules version fails closed rather than
 * silently inheriting V2 damage semantics.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_build_damage_rules_rational_snapshot_private_v1(
    p_rules jsonb
  )
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_rules_version integer;

  v_base_damage numeric;
  v_blast_min_damage_ratio numeric;

  v_base_rational jsonb;
  v_ratio_rational jsonb;

  v_snapshot jsonb;
BEGIN
  IF jsonb_typeof(
       p_rules
     ) <> 'object'
     OR jsonb_typeof(
          p_rules -> 'version'
        ) <> 'number'
     OR COALESCE(
          p_rules ->> 'version',
          ''
        ) !~ '^[1-9][0-9]*$'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_DAMAGE_RATIONAL_RULES_INVALID';
  END IF;


  BEGIN
    v_rules_version :=
      (
        p_rules ->> 'version'
      )::integer;
  EXCEPTION
    WHEN invalid_text_representation
      OR numeric_value_out_of_range
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_DAMAGE_RATIONAL_RULES_VERSION_INVALID';
  END;


  IF v_rules_version = 1
  THEN
    RETURN NULL;
  END IF;


  IF v_rules_version <> 2
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_DAMAGE_RATIONAL_RULES_VERSION_UNSUPPORTED';
  END IF;


  IF public.cing_artillery_validate_physics_rules_v2(
       p_rules
     )
     IS NOT TRUE
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_DAMAGE_RATIONAL_RULES_V2_INVALID';
  END IF;


  BEGIN
    v_base_damage :=
      (
        p_rules ->>
          'base_damage'
      )::numeric;

    v_blast_min_damage_ratio :=
      (
        p_rules ->>
          'blast_min_damage_ratio'
      )::numeric;
  EXCEPTION
    WHEN invalid_text_representation
      OR numeric_value_out_of_range
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_DAMAGE_RATIONAL_DECIMAL_INVALID';
  END;


  IF v_base_damage <= 0
     OR v_blast_min_damage_ratio <= 0
     OR v_blast_min_damage_ratio > 1
     OR (
          p_rules ->>
            'damage_formula_version'
        ) <> '1'
     OR (
          p_rules ->>
            'damage_rounding'
        ) <> 'floor'
     OR (
          p_rules ->>
            'self_damage_enabled'
        )::boolean <>
        false
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_DAMAGE_RATIONAL_SEMANTICS_INVALID';
  END IF;


  v_base_rational :=
    public.cing_artillery_numeric_to_reduced_rational_private_v1(
      v_base_damage
    );

  v_ratio_rational :=
    public.cing_artillery_numeric_to_reduced_rational_private_v1(
      v_blast_min_damage_ratio
    );


  v_snapshot :=
    jsonb_build_object(
      'version',
        1,

      'rules_version',
        2,

      'base_damage_numerator',
        v_base_rational ->> 'numerator',

      'base_damage_denominator',
        v_base_rational ->> 'denominator',

      'blast_min_damage_ratio_numerator',
        v_ratio_rational ->> 'numerator',

      'blast_min_damage_ratio_denominator',
        v_ratio_rational ->> 'denominator',

      'damage_formula_version',
        1,

      'damage_rounding',
        'floor',

      'self_damage_enabled',
        false
    );


  IF public.cing_artillery_validate_damage_rules_rational_snapshot_private_v1(
       v_snapshot
     )
     IS NOT TRUE
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_DAMAGE_RATIONAL_SNAPSHOT_INVALID';
  END IF;


  RETURN v_snapshot;
END;
$$;


/*
 * =====================================================
 * STORED DERIVED IMMUTABLE COMBAT AUTHORITY
 * =====================================================
 *
 * No combat initializer rewrite is needed.
 *
 * The generated snapshot is materialized from rules_snapshot
 * in the same INSERT/UPDATE row operation and cannot be
 * independently supplied by an application caller.
 */
ALTER TABLE
  public.cing_artillery_combat_states
ADD COLUMN IF NOT EXISTS
  damage_rules_rational_snapshot jsonb
GENERATED ALWAYS AS (
  public.cing_artillery_build_damage_rules_rational_snapshot_private_v1(
    rules_snapshot
  )
)
STORED;


/*
 * V1 must carry no V2 rational snapshot.
 *
 * V2 must carry one canonical validated rational snapshot.
 */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'cing_artillery_combat_states_damage_rules_rational_snapshot_check'
      AND conrelid =
        'public.cing_artillery_combat_states'::regclass
  ) THEN
    ALTER TABLE
      public.cing_artillery_combat_states
    ADD CONSTRAINT
      cing_artillery_combat_states_damage_rules_rational_snapshot_check
    CHECK (
      (
        rules_version = 1
        AND damage_rules_rational_snapshot IS NULL
      )
      OR
      (
        rules_version = 2
        AND damage_rules_rational_snapshot IS NOT NULL
        AND public.cing_artillery_validate_damage_rules_rational_snapshot_private_v1(
              damage_rules_rational_snapshot
            )
            IS TRUE
      )
    );
  END IF;
END;
$$;


/*
 * =====================================================
 * PRIVATE ACL
 * =====================================================
 */

REVOKE ALL
ON FUNCTION
  public.cing_artillery_numeric_to_reduced_rational_private_v1(
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_numeric_to_reduced_rational_private_v1(
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_numeric_to_reduced_rational_private_v1(
    numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_numeric_to_reduced_rational_private_v1(
    numeric
  )
FROM service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_damage_rules_rational_snapshot_private_v1(
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_damage_rules_rational_snapshot_private_v1(
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_damage_rules_rational_snapshot_private_v1(
    jsonb
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_damage_rules_rational_snapshot_private_v1(
    jsonb
  )
FROM service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_build_damage_rules_rational_snapshot_private_v1(
    jsonb
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_build_damage_rules_rational_snapshot_private_v1(
    jsonb
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_build_damage_rules_rational_snapshot_private_v1(
    jsonb
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_build_damage_rules_rational_snapshot_private_v1(
    jsonb
  )
FROM service_role;


COMMIT;
