BEGIN;


/*
 * =====================================================
 * CING PIU PIU / CING ARTILLERY
 * POSTGRESQL CONTACT PARAMETER PRIVATE V1
 * =====================================================
 *
 * PostgreSQL mirror of canonical ContactParameterV1
 * representation semantics.
 *
 * This migration owns exact mathematical VALIDATION only.
 *
 * It does NOT:
 *
 *   mutate gameplay
 *   persist shot resolution
 *   calculate impact projection
 *   calculate damage
 *   mutate HP
 *   complete execution
 *   advance turn
 *   complete combat
 *   expose application-callable authority
 */


/*
 * Exact GCD over integral PostgreSQL NUMERIC values.
 *
 * NUMERIC is used because durable contact coefficients may
 * exceed bigint while remaining exact integers.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_gcd_numeric_private_v1(
    p_left numeric,
    p_right numeric
  )
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_a numeric;
  v_b numeric;
  v_r numeric;
BEGIN
  IF p_left IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR p_right IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR trunc(p_left) <> p_left
     OR trunc(p_right) <> p_right
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_CONTACT_GCD_INTEGER_REQUIRED';
  END IF;

  v_a :=
    abs(p_left);

  v_b :=
    abs(p_right);

  WHILE v_b <> 0 LOOP
    v_r :=
      mod(
        v_a,
        v_b
      );

    v_a :=
      v_b;

    v_b :=
      v_r;
  END LOOP;

  RETURN v_a;
END;
$$;


/*
 * Exact perfect-square predicate for non-negative integral
 * NUMERIC without floating-point sqrt authority.
 *
 * Newton iteration is integer-valued because truncating
 * division is applied explicitly.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_numeric_is_perfect_square_private_v1(
    p_value numeric
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_x numeric;
  v_y numeric;
BEGIN
  IF p_value IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR trunc(p_value) <> p_value
     OR p_value < 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_CONTACT_SQUARE_INTEGER_REQUIRED';
  END IF;

  IF p_value < 2 THEN
    RETURN true;
  END IF;

  /*
   * Start at N itself.
   *
   * x_{n+1} = floor((x + floor(N/x)) / 2)
   *
   * Sequence decreases until integer sqrt floor is reached.
   */
  v_x :=
    p_value;

  LOOP
    v_y :=
      trunc(
        (
          v_x +
          trunc(
            p_value /
            v_x
          )
        ) /
        2
      );

    EXIT WHEN v_y >= v_x;

    v_x :=
      v_y;
  END LOOP;

  RETURN
    v_x * v_x =
      p_value;
END;
$$;


/*
 * Canonical ContactParameterV1 validator.
 *
 * Returns TRUE only when the supplied persisted scalar form
 * is already canonical.
 *
 * It never normalizes caller input.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_validate_contact_parameter_private_v1(
    p_kind text,

    p_numerator numeric,
    p_denominator numeric,

    p_a numeric,
    p_b numeric,
    p_discriminant numeric
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_gcd numeric;
  v_k numeric;
BEGIN
  IF p_kind =
       'rational'
  THEN
    IF p_numerator IS NULL
       OR p_denominator IS NULL

       OR p_a IS NOT NULL
       OR p_b IS NOT NULL
       OR p_discriminant IS NOT NULL

       OR p_numerator IN (
         'NaN'::numeric,
         'Infinity'::numeric,
         '-Infinity'::numeric
       )

       OR p_denominator IN (
         'NaN'::numeric,
         'Infinity'::numeric,
         '-Infinity'::numeric
       )

       OR trunc(
            p_numerator
          ) <> p_numerator

       OR trunc(
            p_denominator
          ) <> p_denominator

       OR p_denominator <= 0

       OR p_numerator < 0

       OR p_numerator >
          p_denominator
    THEN
      RETURN false;
    END IF;


    /*
     * Canonical zero and one are unique:
     *
     *   0/1
     *   1/1
     */
    IF p_numerator = 0 THEN
      RETURN
        p_denominator = 1;
    END IF;

    IF p_numerator =
         p_denominator
    THEN
      RETURN
        p_numerator = 1
        AND
        p_denominator = 1;
    END IF;


    v_gcd :=
      public.cing_artillery_gcd_numeric_private_v1(
        p_numerator,
        p_denominator
      );

    RETURN
      v_gcd = 1;
  END IF;


  IF p_kind =
       'quadratic_lower_root'
  THEN
    IF p_numerator IS NOT NULL
       OR p_denominator IS NOT NULL

       OR p_a IS NULL
       OR p_b IS NULL
       OR p_discriminant IS NULL

       OR p_a IN (
         'NaN'::numeric,
         'Infinity'::numeric,
         '-Infinity'::numeric
       )

       OR p_b IN (
         'NaN'::numeric,
         'Infinity'::numeric,
         '-Infinity'::numeric
       )

       OR p_discriminant IN (
         'NaN'::numeric,
         'Infinity'::numeric,
         '-Infinity'::numeric
       )

       OR trunc(
            p_a
          ) <> p_a

       OR trunc(
            p_b
          ) <> p_b

       OR trunc(
            p_discriminant
          ) <> p_discriminant

       OR p_a <= 0

       OR p_discriminant < 0
    THEN
      RETURN false;
    END IF;


    /*
     * Exact lower-root t >= 0:
     *
     *   (-b - sqrt(D)) / (2a) >= 0
     *
     * because a > 0:
     *
     *   b <= 0
     *   b^2 >= D
     */
    IF p_b > 0
       OR p_b * p_b <
          p_discriminant
    THEN
      RETURN false;
    END IF;


    /*
     * Exact lower-root t <= 1:
     *
     *   -b - sqrt(D) <= 2a
     *
     * k = -b - 2a
     *
     * k <= 0:
     *   automatically true
     *
     * k > 0:
     *   require D >= k^2
     */
    v_k :=
      -p_b -
      2 * p_a;

    IF v_k > 0
       AND p_discriminant <
           v_k * v_k
    THEN
      RETURN false;
    END IF;


    /*
     * Perfect-square discriminants are rational and must
     * never persist as quadratic_lower_root.
     */
    IF public.cing_artillery_numeric_is_perfect_square_private_v1(
         p_discriminant
       )
    THEN
      RETURN false;
    END IF;


    RETURN true;
  END IF;


  RETURN false;
END;
$$;


/*
 * Private-only ACL.
 */
REVOKE ALL
ON FUNCTION
  public.cing_artillery_gcd_numeric_private_v1(
    numeric,
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_gcd_numeric_private_v1(
    numeric,
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_gcd_numeric_private_v1(
    numeric,
    numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_gcd_numeric_private_v1(
    numeric,
    numeric
  )
FROM service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_numeric_is_perfect_square_private_v1(
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_numeric_is_perfect_square_private_v1(
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_numeric_is_perfect_square_private_v1(
    numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_numeric_is_perfect_square_private_v1(
    numeric
  )
FROM service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_contact_parameter_private_v1(
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_contact_parameter_private_v1(
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_contact_parameter_private_v1(
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_contact_parameter_private_v1(
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM service_role;


COMMIT;
