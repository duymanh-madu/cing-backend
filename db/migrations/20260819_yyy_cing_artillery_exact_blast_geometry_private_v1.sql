BEGIN;


/*
 * =====================================================
 * CING PIU PIU / CING ARTILLERY
 * EXACT BLAST GEOMETRY PRIVATE V1
 * =====================================================
 *
 * Pure PostgreSQL mathematical authority for:
 *
 *   exact affine projectile-center impact
 *            vs
 *   one fixed closed circle
 *
 * and:
 *
 *   exact floor of Euclidean distance
 *
 * in physics fixed-point lattice units.
 *
 * Inputs are already canonical:
 *
 *   start_x_scaled
 *   start_y_scaled
 *   delta_x_scaled
 *   delta_y_scaled
 *
 *   ContactParameterV1
 *
 *   circle_center_x_scaled
 *   circle_center_y_scaled
 *   radius_scaled
 *
 * This migration does NOT:
 *
 *   read combat/world rows
 *   read rules snapshots
 *   derive opponent identity
 *   derive player center
 *   derive blast radius
 *   calculate damage
 *   choose target_account_id
 *   mutate gameplay
 *   expose EXECUTE
 *
 * PostgreSQL NUMERIC is used internally as exact integer
 * arithmetic because squared canonical lattice magnitudes
 * may exceed signed BIGINT while remaining exact.
 */


/*
 * Return exact relation:
 *
 *   inside
 *   tangent
 *   outside
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_classify_affine_point_circle_private_v1(
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

    p_circle_center_x_scaled bigint,
    p_circle_center_y_scaled bigint,
    p_radius_scaled bigint
  )
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ux numeric;
  v_uy numeric;

  v_dx numeric;
  v_dy numeric;

  v_radius numeric;

  v_poly_a numeric;
  v_poly_b numeric;
  v_poly_c numeric;

  v_contact_numerator numeric;
  v_contact_denominator numeric;

  v_scaled_value numeric;

  v_contact_a numeric;
  v_contact_b numeric;
  v_contact_discriminant numeric;

  v_radical_constant numeric;
  v_radical_sqrt_coefficient numeric;

  v_sign integer;
BEGIN
  IF p_radius_scaled IS NULL
     OR p_radius_scaled <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_BLAST_GEOMETRY_RADIUS_INVALID';
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
          'CING_ARTILLERY_BLAST_GEOMETRY_CONTACT_INVALID';
  END IF;


  v_ux :=
    p_start_x_scaled::numeric -
    p_circle_center_x_scaled::numeric;

  v_uy :=
    p_start_y_scaled::numeric -
    p_circle_center_y_scaled::numeric;

  v_dx :=
    p_delta_x_scaled::numeric;

  v_dy :=
    p_delta_y_scaled::numeric;

  v_radius :=
    p_radius_scaled::numeric;


  /*
   * Distance polynomial:
   *
   *   F(t) =
   *     A*t^2 +
   *     B*t +
   *     C
   *
   * Circle relation:
   *
   *   F(t) < 0  -> inside
   *   F(t) = 0  -> tangent
   *   F(t) > 0  -> outside
   */
  v_poly_a :=
    v_dx * v_dx +
    v_dy * v_dy;

  v_poly_b :=
    2 *
    (
      v_ux * v_dx +
      v_uy * v_dy
    );

  v_poly_c :=
    v_ux * v_ux +
    v_uy * v_uy -
    v_radius * v_radius;


  IF p_contact_kind =
       'rational'
  THEN
    v_contact_numerator :=
      p_contact_numerator;

    v_contact_denominator :=
      p_contact_denominator;


    v_scaled_value :=
      v_poly_a * v_contact_numerator * v_contact_numerator
      +
      v_poly_b * v_contact_numerator * v_contact_denominator
      +
      v_poly_c * v_contact_denominator * v_contact_denominator;


    IF v_scaled_value < 0 THEN
      RETURN 'inside';
    END IF;

    IF v_scaled_value > 0 THEN
      RETURN 'outside';
    END IF;

    RETURN 'tangent';
  END IF;


  IF p_contact_kind <>
       'quadratic_lower_root'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_BLAST_GEOMETRY_CONTACT_KIND_UNSUPPORTED';
  END IF;


  v_contact_a :=
    p_contact_a;

  v_contact_b :=
    p_contact_b;

  v_contact_discriminant :=
    p_contact_discriminant;


  /*
   * For:
   *
   *   t =
   *     (-b - sqrt(D)) / (2a)
   *
   * multiplying F(t) by positive 4a^2 gives:
   *
   *   P + Q*sqrt(D)
   *
   * where:
   *
   *   P =
   *     A*(b^2 + D)
   *     - 2*a*B*b
   *     + 4*a^2*C
   *
   *   Q =
   *     2*(A*b - a*B)
   */
  v_radical_constant :=
    v_poly_a *
      (
        v_contact_b * v_contact_b +
        v_contact_discriminant
      )
    -
    2 *
      v_contact_a *
      v_poly_b *
      v_contact_b
    +
    4 *
      v_contact_a *
      v_contact_a *
      v_poly_c;

  v_radical_sqrt_coefficient :=
    2 *
    (
      v_poly_a * v_contact_b -
      v_contact_a * v_poly_b
    );


  v_sign :=
    public.cing_artillery_sign_integer_plus_sqrt_private_v1(
      v_radical_constant,
      v_radical_sqrt_coefficient,
      v_contact_discriminant
    );


  IF v_sign < 0 THEN
    RETURN 'inside';
  END IF;

  IF v_sign > 0 THEN
    RETURN 'outside';
  END IF;

  RETURN 'tangent';
END;
$$;


/*
 * Exact floor of distance from the canonical exact impact
 * to one fixed center.
 *
 * Contract:
 *
 *   radius_scaled is a positive exact upper bound.
 *
 *   exact distance MUST be <= radius_scaled.
 *
 * Search finds the smallest positive integer R such that:
 *
 *   distance <= R
 *
 * If relation(R) = tangent:
 *   floor(distance) = R
 *
 * If relation(R) = inside:
 *   floor(distance) = R - 1
 *
 * Radius zero is not permitted here; blast radius authority
 * is strictly positive.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_exact_blast_distance_floor_private_v1(
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

    p_circle_center_x_scaled bigint,
    p_circle_center_y_scaled bigint,
    p_blast_radius_scaled bigint
  )
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_relation text;

  v_low bigint;
  v_high bigint;
  v_mid bigint;

  v_ceiling_distance bigint;
  v_distance_floor bigint;
BEGIN
  IF p_blast_radius_scaled IS NULL
     OR p_blast_radius_scaled <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_BLAST_DISTANCE_RADIUS_INVALID';
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
          'CING_ARTILLERY_BLAST_DISTANCE_CONTACT_INVALID';
  END IF;


  v_relation :=
    public.cing_artillery_classify_affine_point_circle_private_v1(
      p_start_x_scaled,
      p_start_y_scaled,
      p_delta_x_scaled,
      p_delta_y_scaled,

      p_contact_kind,
      p_contact_numerator,
      p_contact_denominator,
      p_contact_a,
      p_contact_b,
      p_contact_discriminant,

      p_circle_center_x_scaled,
      p_circle_center_y_scaled,
      p_blast_radius_scaled
    );


  IF v_relation =
       'outside'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_BLAST_DISTANCE_OUTSIDE_RADIUS';
  END IF;


  v_low :=
    1;

  v_high :=
    p_blast_radius_scaled;


  WHILE v_low < v_high
  LOOP
    v_mid :=
      v_low +
      (
        v_high -
        v_low
      ) / 2;


    v_relation :=
      public.cing_artillery_classify_affine_point_circle_private_v1(
        p_start_x_scaled,
        p_start_y_scaled,
        p_delta_x_scaled,
        p_delta_y_scaled,

        p_contact_kind,
        p_contact_numerator,
        p_contact_denominator,
        p_contact_a,
        p_contact_b,
        p_contact_discriminant,

        p_circle_center_x_scaled,
        p_circle_center_y_scaled,
        v_mid
      );


    IF v_relation =
         'outside'
    THEN
      v_low :=
        v_mid +
        1;
    ELSE
      v_high :=
        v_mid;
    END IF;
  END LOOP;


  v_ceiling_distance :=
    v_low;


  v_relation :=
    public.cing_artillery_classify_affine_point_circle_private_v1(
      p_start_x_scaled,
      p_start_y_scaled,
      p_delta_x_scaled,
      p_delta_y_scaled,

      p_contact_kind,
      p_contact_numerator,
      p_contact_denominator,
      p_contact_a,
      p_contact_b,
      p_contact_discriminant,

      p_circle_center_x_scaled,
      p_circle_center_y_scaled,
      v_ceiling_distance
    );


  IF v_relation =
       'tangent'
  THEN
    v_distance_floor :=
      v_ceiling_distance;
  ELSIF v_relation =
          'inside'
  THEN
    v_distance_floor :=
      v_ceiling_distance -
      1;
  ELSE
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_BLAST_DISTANCE_SEARCH_INVARIANT_INVALID';
  END IF;


  IF v_distance_floor < 0
     OR v_distance_floor >
        p_blast_radius_scaled
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_BLAST_DISTANCE_RESULT_INVALID';
  END IF;


  RETURN v_distance_floor;
END;
$$;


/*
 * =====================================================
 * PRIVATE ACL
 * =====================================================
 */

REVOKE ALL
ON FUNCTION
  public.cing_artillery_classify_affine_point_circle_private_v1(
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
    bigint,
    bigint,
    bigint
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_classify_affine_point_circle_private_v1(
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
    bigint,
    bigint,
    bigint
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_classify_affine_point_circle_private_v1(
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
    bigint,
    bigint,
    bigint
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_classify_affine_point_circle_private_v1(
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
    bigint,
    bigint,
    bigint
  )
FROM service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_exact_blast_distance_floor_private_v1(
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
    bigint,
    bigint,
    bigint
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_exact_blast_distance_floor_private_v1(
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
    bigint,
    bigint,
    bigint
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_exact_blast_distance_floor_private_v1(
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
    bigint,
    bigint,
    bigint
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_exact_blast_distance_floor_private_v1(
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
    bigint,
    bigint,
    bigint
  )
FROM service_role;


COMMIT;
