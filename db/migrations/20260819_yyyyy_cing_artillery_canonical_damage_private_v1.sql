BEGIN;


/*
 * =====================================================
 * CING PIU PIU / CING ARTILLERY
 * CANONICAL DAMAGE PRIVATE V1
 * =====================================================
 *
 * Pure PostgreSQL mathematical authority for Damage Formula V1.
 *
 * Inputs:
 *
 *   immutable exact rational damage rules snapshot
 *   immutable attacker attack
 *   immutable defender defense
 *
 * Direct mode:
 *
 *   base_damage
 *     *
 *   (2 * attack) / (attack + defense)
 *
 * Blast mode:
 *
 *   direct_raw
 *     *
 *   max(
 *     blast_min_damage_ratio,
 *     (blast_radius_scaled - distance_floor_scaled)
 *       / blast_radius_scaled
 *   )
 *
 * Final damage:
 *
 *   max(
 *     1,
 *     floor(exact_raw_rational)
 *   )
 *
 * No intermediate rounding.
 * No floating point.
 * No approximate division.
 * No gameplay row reads.
 * No target identity authority.
 * No HP mutation.
 * No resolution mutation.
 */


/*
 * Exact positive integer quotient for NUMERIC integer operands.
 *
 * This function deliberately accepts NUMERIC rather than BIGINT
 * because exact intermediate products may exceed signed BIGINT.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_positive_integer_quotient_private_v1(
    p_numerator numeric,
    p_denominator numeric
  )
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_numerator = 'NaN'::numeric
     OR p_numerator = 'Infinity'::numeric
     OR p_numerator = '-Infinity'::numeric
     OR p_denominator = 'NaN'::numeric
     OR p_denominator = 'Infinity'::numeric
     OR p_denominator = '-Infinity'::numeric

     OR p_numerator < 0
     OR p_denominator <= 0

     OR p_numerator <>
        trunc(
          p_numerator
        )
     OR p_denominator <>
        trunc(
          p_denominator
        )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_DAMAGE_INTEGER_QUOTIENT_INVALID';
  END IF;


  RETURN div(
    p_numerator,
    p_denominator
  );
END;
$$;


/*
 * Calculate canonical positive damage for an affected target.
 *
 * p_mode:
 *
 *   direct
 *     p_blast_radius_scaled MUST be NULL
 *     p_blast_distance_floor_scaled MUST be NULL
 *
 *   blast
 *     both blast values MUST be present
 *     radius > 0
 *     0 <= distance <= radius
 *
 * Unaffected / no-impact outcomes are intentionally outside this
 * function and remain canonical zero-damage branches in the writer.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_calculate_canonical_damage_private_v1(
    p_damage_rules_snapshot jsonb,
    p_attacker_attack integer,
    p_defender_defense integer,
    p_mode text,
    p_blast_radius_scaled bigint,
    p_blast_distance_floor_scaled bigint
  )
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_base_numerator numeric;
  v_base_denominator numeric;

  v_min_ratio_numerator numeric;
  v_min_ratio_denominator numeric;

  v_stat_numerator numeric;
  v_stat_denominator numeric;

  v_factor_numerator numeric;
  v_factor_denominator numeric;

  v_linear_numerator numeric;
  v_linear_denominator numeric;

  v_raw_numerator numeric;
  v_raw_denominator numeric;

  v_damage numeric;
BEGIN
  IF p_damage_rules_snapshot IS NULL
     OR public.cing_artillery_validate_damage_rules_rational_snapshot_private_v1(
          p_damage_rules_snapshot
        )
        IS NOT TRUE
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_DAMAGE_RULES_SNAPSHOT_INVALID';
  END IF;


  IF p_attacker_attack IS NULL
     OR p_attacker_attack <= 0
     OR p_defender_defense IS NULL
     OR p_defender_defense <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_DAMAGE_STATS_INVALID';
  END IF;


  IF p_mode IS NULL
     OR p_mode NOT IN (
          'direct',
          'blast'
        )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_DAMAGE_MODE_INVALID';
  END IF;


  /*
   * Rational snapshot validator already guarantees:
   *
   *   positive integer-string numerators/denominators
   *   reduced form
   *   min ratio <= 1
   *   formula version = 1
   *   rounding = floor
   *   self damage = false
   */
  v_base_numerator :=
    (
      p_damage_rules_snapshot ->>
        'base_damage_numerator'
    )::numeric;

  v_base_denominator :=
    (
      p_damage_rules_snapshot ->>
        'base_damage_denominator'
    )::numeric;

  v_min_ratio_numerator :=
    (
      p_damage_rules_snapshot ->>
        'blast_min_damage_ratio_numerator'
    )::numeric;

  v_min_ratio_denominator :=
    (
      p_damage_rules_snapshot ->>
        'blast_min_damage_ratio_denominator'
    )::numeric;


  /*
   * Exact stat modifier:
   *
   *   2A / (A + D)
   */
  v_stat_numerator :=
    2 *
    p_attacker_attack::numeric;

  v_stat_denominator :=
    p_attacker_attack::numeric +
    p_defender_defense::numeric;


  IF p_mode =
       'direct'
  THEN
    IF p_blast_radius_scaled IS NOT NULL
       OR p_blast_distance_floor_scaled IS NOT NULL
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_DIRECT_DAMAGE_BLAST_GEOMETRY_FORBIDDEN';
    END IF;


    v_factor_numerator :=
      1;

    v_factor_denominator :=
      1;


  ELSE
    IF p_blast_radius_scaled IS NULL
       OR p_blast_radius_scaled <= 0
       OR p_blast_distance_floor_scaled IS NULL
       OR p_blast_distance_floor_scaled < 0
       OR p_blast_distance_floor_scaled >
          p_blast_radius_scaled
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_BLAST_DAMAGE_GEOMETRY_INVALID';
    END IF;


    /*
     * Exact linear falloff:
     *
     *   (R - d) / R
     */
    v_linear_numerator :=
      p_blast_radius_scaled::numeric -
      p_blast_distance_floor_scaled::numeric;

    v_linear_denominator :=
      p_blast_radius_scaled::numeric;


    /*
     * Exact max(
     *   min_ratio,
     *   linear
     * )
     *
     * No division:
     *
     *   min_n / min_d >= linear_n / linear_d
     *
     * iff
     *
     *   min_n * linear_d >= linear_n * min_d
     */
    IF (
         v_min_ratio_numerator *
         v_linear_denominator
       ) >= (
         v_linear_numerator *
         v_min_ratio_denominator
       )
    THEN
      v_factor_numerator :=
        v_min_ratio_numerator;

      v_factor_denominator :=
        v_min_ratio_denominator;
    ELSE
      v_factor_numerator :=
        v_linear_numerator;

      v_factor_denominator :=
        v_linear_denominator;
    END IF;
  END IF;


  /*
   * Exact raw rational:
   *
   *   base
   *   × stat modifier
   *   × blast/direct factor
   */
  v_raw_numerator :=
    v_base_numerator
    *
    v_stat_numerator
    *
    v_factor_numerator;

  v_raw_denominator :=
    v_base_denominator
    *
    v_stat_denominator
    *
    v_factor_denominator;


  IF v_raw_numerator <= 0
     OR v_raw_denominator <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_DAMAGE_RAW_RATIONAL_INVALID';
  END IF;


  /*
   * Damage Formula V1 rounds exactly once:
   *
   *   floor(raw)
   *
   * affected target minimum:
   *
   *   max(1, floor(raw))
   */
  v_damage :=
    public.cing_artillery_positive_integer_quotient_private_v1(
      v_raw_numerator,
      v_raw_denominator
    );


  IF v_damage < 1
  THEN
    v_damage :=
      1;
  END IF;


  IF v_damage <>
       trunc(
         v_damage
       )
     OR v_damage <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_DAMAGE_RESULT_INVALID';
  END IF;


  RETURN v_damage;
END;
$$;


/*
 * =====================================================
 * PRIVATE ACL
 * =====================================================
 */

REVOKE ALL
ON FUNCTION
  public.cing_artillery_positive_integer_quotient_private_v1(
    numeric,
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_positive_integer_quotient_private_v1(
    numeric,
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_positive_integer_quotient_private_v1(
    numeric,
    numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_positive_integer_quotient_private_v1(
    numeric,
    numeric
  )
FROM service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_calculate_canonical_damage_private_v1(
    jsonb,
    integer,
    integer,
    text,
    bigint,
    bigint
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_calculate_canonical_damage_private_v1(
    jsonb,
    integer,
    integer,
    text,
    bigint,
    bigint
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_calculate_canonical_damage_private_v1(
    jsonb,
    integer,
    integer,
    text,
    bigint,
    bigint
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_calculate_canonical_damage_private_v1(
    jsonb,
    integer,
    integer,
    text,
    bigint,
    bigint
  )
FROM service_role;


COMMIT;
