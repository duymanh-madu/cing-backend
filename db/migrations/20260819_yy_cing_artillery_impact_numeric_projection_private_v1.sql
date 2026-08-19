BEGIN;


/*
 * =====================================================
 * CING PIU PIU / CING ARTILLERY
 * IMPACT NUMERIC PROJECTION PRIVATE V1
 * =====================================================
 *
 * PostgreSQL verification authority for deterministic
 * compatibility projection:
 *
 *   exact affine impact coordinate
 *
 *     start_scaled + delta_scaled * t
 *
 *   divided by physics_fixed_scale
 *
 *     ->
 *
 *   nearest 1e-12 numeric grid
 *
 * with exact half ties away from zero.
 *
 * ContactParameterV1 remains the exact symbolic authority.
 *
 * No floating-point.
 * No sqrt().
 * No normalization.
 * No gameplay mutation.
 */


/*
 * Exact sign of:
 *
 *   C + R * sqrt(D)
 *
 * where C, R and D are exact integers and D >= 0.
 *
 * The implementation never evaluates sqrt(D).
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_sign_integer_plus_sqrt_private_v1(
    p_integer numeric,
    p_sqrt_coefficient numeric,
    p_discriminant numeric
  )
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_left_squared numeric;
  v_right_squared numeric;
BEGIN
  IF p_integer IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR p_sqrt_coefficient IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR p_discriminant IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR trunc(p_integer) <> p_integer
     OR trunc(p_sqrt_coefficient) <>
        p_sqrt_coefficient
     OR trunc(p_discriminant) <>
        p_discriminant
     OR p_discriminant < 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_PROJECTION_RADICAL_SIGN_INPUT_INVALID';
  END IF;


  IF p_sqrt_coefficient = 0 THEN
    IF p_integer < 0 THEN
      RETURN -1;
    END IF;

    IF p_integer > 0 THEN
      RETURN 1;
    END IF;

    RETURN 0;
  END IF;


  /*
   * C + R*sqrt(D), R > 0.
   */
  IF p_sqrt_coefficient > 0 THEN
    IF p_integer >= 0 THEN
      IF p_integer = 0
         AND p_discriminant = 0
      THEN
        RETURN 0;
      END IF;

      RETURN 1;
    END IF;

    v_left_squared :=
      p_sqrt_coefficient *
      p_sqrt_coefficient *
      p_discriminant;

    v_right_squared :=
      p_integer *
      p_integer;

    IF v_left_squared <
         v_right_squared
    THEN
      RETURN -1;
    END IF;

    IF v_left_squared >
         v_right_squared
    THEN
      RETURN 1;
    END IF;

    RETURN 0;
  END IF;


  /*
   * C + R*sqrt(D), R < 0.
   */
  IF p_integer <= 0 THEN
    IF p_integer = 0
       AND p_discriminant = 0
    THEN
      RETURN 0;
    END IF;

    RETURN -1;
  END IF;


  v_left_squared :=
    p_integer *
    p_integer;

  v_right_squared :=
    p_sqrt_coefficient *
    p_sqrt_coefficient *
    p_discriminant;

  IF v_left_squared <
       v_right_squared
  THEN
    RETURN -1;
  END IF;

  IF v_left_squared >
       v_right_squared
  THEN
    RETURN 1;
  END IF;

  RETURN 0;
END;
$$;


/*
 * Compare one exact affine impact coordinate against:
 *
 *   threshold_twice_grid / (2 * 10^12)
 *
 * in final pixel units.
 *
 * Return:
 *
 *   -1 exact coordinate < threshold
 *    0 exact coordinate = threshold
 *    1 exact coordinate > threshold
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_compare_impact_coordinate_half_grid_private_v1(
    p_start_scaled bigint,
    p_delta_scaled bigint,
    p_physics_fixed_scale bigint,

    p_contact_kind text,
    p_contact_numerator numeric,
    p_contact_denominator numeric,
    p_contact_a numeric,
    p_contact_b numeric,
    p_contact_discriminant numeric,

    p_threshold_twice_grid numeric
  )
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_quantum_denominator numeric :=
    1000000000000;

  v_difference numeric;

  v_integer_part numeric;
  v_sqrt_coefficient numeric;
BEGIN
  IF p_physics_fixed_scale <= 0
     OR p_threshold_twice_grid IS NULL
     OR p_threshold_twice_grid IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR trunc(
          p_threshold_twice_grid
        ) <> p_threshold_twice_grid
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_PROJECTION_HALF_GRID_INPUT_INVALID';
  END IF;


  IF public.cing_artillery_validate_contact_parameter_private_v1(
       p_contact_kind,
       p_contact_numerator,
       p_contact_denominator,
       p_contact_a,
       p_contact_b,
       p_contact_discriminant
     )
     IS NOT TRUE
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_PROJECTION_CONTACT_PARAMETER_INVALID';
  END IF;


  /*
   * Rational:
   *
   * exact =
   *
   *   (start*d + delta*n)
   *   -------------------
   *        d * scale
   *
   * Compare against m/(2Q):
   *
   * sign of:
   *
   *   2Q(start*d + delta*n)
   *     - m*d*scale
   */
  IF p_contact_kind =
       'rational'
  THEN
    v_difference :=
      2 *
      v_quantum_denominator *
      (
        p_start_scaled *
          p_contact_denominator
        +
        p_delta_scaled *
          p_contact_numerator
      )
      -
      p_threshold_twice_grid *
      p_contact_denominator *
      p_physics_fixed_scale;

    IF v_difference < 0 THEN
      RETURN -1;
    END IF;

    IF v_difference > 0 THEN
      RETURN 1;
    END IF;

    RETURN 0;
  END IF;


  /*
   * Quadratic lower root:
   *
   * t =
   *
   *   (-b - sqrt(D))
   *   ----------------
   *          2a
   *
   * exact coordinate =
   *
   *   2a*start - delta*b - delta*sqrt(D)
   *   -----------------------------------
   *              2a*scale
   *
   * Compare to m/(2Q).
   *
   * After multiplying by positive a*scale*Q,
   * the exact sign becomes:
   *
   *   C + R*sqrt(D)
   *
   * where:
   *
   *   C =
   *     Q*(2a*start - delta*b)
   *       - m*a*scale
   *
   *   R =
   *     -Q*delta
   */
  v_integer_part :=
    v_quantum_denominator *
    (
      2 *
      p_contact_a *
      p_start_scaled
      -
      p_delta_scaled *
      p_contact_b
    )
    -
    p_threshold_twice_grid *
    p_contact_a *
    p_physics_fixed_scale;

  v_sqrt_coefficient :=
    -v_quantum_denominator *
    p_delta_scaled;


  RETURN
    public.cing_artillery_sign_integer_plus_sqrt_private_v1(
      v_integer_part,
      v_sqrt_coefficient,
      p_contact_discriminant
    );
END;
$$;


/*
 * Validate one supplied NUMERIC compatibility projection.
 *
 * Candidate must lie exactly on 1e-12 grid.
 *
 * Rounding:
 *
 *   nearest
 *   exact-half ties away from zero
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_validate_impact_projection_coordinate_private_v1(
    p_start_scaled bigint,
    p_delta_scaled bigint,
    p_physics_fixed_scale bigint,

    p_contact_kind text,
    p_contact_numerator numeric,
    p_contact_denominator numeric,
    p_contact_a numeric,
    p_contact_b numeric,
    p_contact_discriminant numeric,

    p_projection numeric
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_quantum_denominator numeric :=
    1000000000000;

  v_grid_integer numeric;

  v_lower_threshold_twice numeric;
  v_upper_threshold_twice numeric;

  v_lower_compare integer;
  v_upper_compare integer;
BEGIN
  IF p_physics_fixed_scale <= 0
     OR p_projection IS NULL
     OR p_projection IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
  THEN
    RETURN false;
  END IF;


  IF public.cing_artillery_validate_contact_parameter_private_v1(
       p_contact_kind,
       p_contact_numerator,
       p_contact_denominator,
       p_contact_a,
       p_contact_b,
       p_contact_discriminant
     )
     IS NOT TRUE
  THEN
    RETURN false;
  END IF;


  v_grid_integer :=
    p_projection *
    v_quantum_denominator;


  IF trunc(
       v_grid_integer
     ) <> v_grid_integer
  THEN
    RETURN false;
  END IF;


  v_lower_threshold_twice :=
    2 *
    v_grid_integer -
    1;

  v_upper_threshold_twice :=
    2 *
    v_grid_integer +
    1;


  v_lower_compare :=
    public.cing_artillery_compare_impact_coordinate_half_grid_private_v1(
      p_start_scaled,
      p_delta_scaled,
      p_physics_fixed_scale,

      p_contact_kind,
      p_contact_numerator,
      p_contact_denominator,
      p_contact_a,
      p_contact_b,
      p_contact_discriminant,

      v_lower_threshold_twice
    );


  v_upper_compare :=
    public.cing_artillery_compare_impact_coordinate_half_grid_private_v1(
      p_start_scaled,
      p_delta_scaled,
      p_physics_fixed_scale,

      p_contact_kind,
      p_contact_numerator,
      p_contact_denominator,
      p_contact_a,
      p_contact_b,
      p_contact_discriminant,

      v_upper_threshold_twice
    );


  /*
   * Positive result grid point:
   *
   * lower half tie belongs to this point.
   * upper half tie belongs to the next point.
   */
  IF v_grid_integer > 0 THEN
    RETURN
      v_lower_compare >= 0
      AND
      v_upper_compare < 0;
  END IF;


  /*
   * Negative result grid point:
   *
   * lower half tie belongs to the more-negative point.
   * upper half tie belongs to this point.
   */
  IF v_grid_integer < 0 THEN
    RETURN
      v_lower_compare > 0
      AND
      v_upper_compare <= 0;
  END IF;


  /*
   * Zero:
   *
   * both +/- half quantum ties round away from zero,
   * therefore both boundaries are exclusive.
   */
  RETURN
    v_lower_compare > 0
    AND
    v_upper_compare < 0;
END;
$$;


/*
 * Validate the durable X/Y projection pair.
 *
 * Both coordinates share the same exact ContactParameterV1.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_validate_impact_numeric_projection_private_v1(
    p_projection_version integer,
    p_physics_fixed_scale bigint,

    p_start_x_scaled bigint,
    p_start_y_scaled bigint,
    p_delta_x_scaled bigint,
    p_delta_y_scaled bigint,

    p_contact_kind text,
    p_contact_numerator numeric,
    p_contact_denominator numeric,
    p_contact_a numeric,
    p_contact_b numeric,
    p_contact_discriminant numeric,

    p_impact_x numeric,
    p_impact_y numeric
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_projection_version IS DISTINCT FROM 1
     OR p_physics_fixed_scale <= 0
  THEN
    RETURN false;
  END IF;


  IF public.cing_artillery_validate_contact_parameter_private_v1(
       p_contact_kind,
       p_contact_numerator,
       p_contact_denominator,
       p_contact_a,
       p_contact_b,
       p_contact_discriminant
     )
     IS NOT TRUE
  THEN
    RETURN false;
  END IF;


  IF public.cing_artillery_validate_impact_projection_coordinate_private_v1(
       p_start_x_scaled,
       p_delta_x_scaled,
       p_physics_fixed_scale,

       p_contact_kind,
       p_contact_numerator,
       p_contact_denominator,
       p_contact_a,
       p_contact_b,
       p_contact_discriminant,

       p_impact_x
     )
     IS NOT TRUE
  THEN
    RETURN false;
  END IF;


  IF public.cing_artillery_validate_impact_projection_coordinate_private_v1(
       p_start_y_scaled,
       p_delta_y_scaled,
       p_physics_fixed_scale,

       p_contact_kind,
       p_contact_numerator,
       p_contact_denominator,
       p_contact_a,
       p_contact_b,
       p_contact_discriminant,

       p_impact_y
     )
     IS NOT TRUE
  THEN
    RETURN false;
  END IF;


  RETURN true;
END;
$$;


/*
 * =====================================================
 * PRIVATE ACL
 * =====================================================
 */

REVOKE ALL
ON FUNCTION
  public.cing_artillery_sign_integer_plus_sqrt_private_v1(
    numeric,
    numeric,
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_sign_integer_plus_sqrt_private_v1(
    numeric,
    numeric,
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_sign_integer_plus_sqrt_private_v1(
    numeric,
    numeric,
    numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_sign_integer_plus_sqrt_private_v1(
    numeric,
    numeric,
    numeric
  )
FROM service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_compare_impact_coordinate_half_grid_private_v1(
    bigint,
    bigint,
    bigint,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_compare_impact_coordinate_half_grid_private_v1(
    bigint,
    bigint,
    bigint,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_compare_impact_coordinate_half_grid_private_v1(
    bigint,
    bigint,
    bigint,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_compare_impact_coordinate_half_grid_private_v1(
    bigint,
    bigint,
    bigint,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_impact_projection_coordinate_private_v1(
    bigint,
    bigint,
    bigint,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_impact_projection_coordinate_private_v1(
    bigint,
    bigint,
    bigint,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_impact_projection_coordinate_private_v1(
    bigint,
    bigint,
    bigint,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_impact_projection_coordinate_private_v1(
    bigint,
    bigint,
    bigint,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_impact_numeric_projection_private_v1(
    integer,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_impact_numeric_projection_private_v1(
    integer,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_impact_numeric_projection_private_v1(
    integer,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_impact_numeric_projection_private_v1(
    integer,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM service_role;


COMMIT;
