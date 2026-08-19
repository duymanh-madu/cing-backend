BEGIN;


/*
 * =====================================================
 * CING PIU PIU / CING ARTILLERY
 * SEGMENT EVENT PRIVATE V1
 * =====================================================
 *
 * Exact PostgreSQL port of the locked JS segment-event
 * authority:
 *
 *   exact ContactParameterV1 ordering
 *   -> segment/circle earliest
 *   -> closed-AABB earliest
 *   -> rounded-pixel-cell earliest
 *   -> terrain global earliest
 *   -> projectile/player earliest
 *   -> PLAYER wins player/terrain exact tie
 *   -> projectile expanded-world exit
 *   -> collision wins boundary-exit exact tie
 *   -> already_outside wins immediately
 *
 * Pure deterministic geometry only.
 *
 * NO:
 *
 *   gameplay row reads
 *   gameplay mutation
 *   resolution persistence
 *   HP mutation
 *   turn advancement
 *   combat completion
 *   floating point
 *   sqrt approximation
 *   application EXECUTE authority
 *
 * PostgreSQL NUMERIC is used as an arbitrary-precision
 * exact INTEGER container whenever intermediate products
 * may exceed BIGINT.
 *
 * Canonical ContactParameterV1 transport:
 *
 * rational:
 *
 *   {
 *     "kind": "rational",
 *     "numerator": "<integer>",
 *     "denominator": "<positive integer>"
 *   }
 *
 * quadratic:
 *
 *   {
 *     "kind": "quadratic_lower_root",
 *     "a": "<positive integer>",
 *     "b": "<integer>",
 *     "discriminant": "<non-negative integer>"
 *   }
 *
 * All exact integers cross JSONB as decimal STRINGS.
 */


/*
 * Mathematical floor division for exact integer NUMERIC.
 *
 * PostgreSQL div() truncates toward zero, while canonical
 * fixed-point cell ownership requires mathematical floor.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_floor_div_numeric_private_v1(
    p_numerator numeric,
    p_denominator numeric
  )
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_q numeric;
  v_r numeric;
BEGIN
  IF p_numerator IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR p_denominator IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR trunc(p_numerator) <> p_numerator
     OR trunc(p_denominator) <> p_denominator
     OR p_denominator <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SEGMENT_EVENT_FLOOR_DIV_INVALID';
  END IF;

  v_q :=
    div(
      p_numerator,
      p_denominator
    );

  v_r :=
    mod(
      p_numerator,
      p_denominator
    );

  IF p_numerator < 0
     AND v_r <> 0
  THEN
    v_q :=
      v_q - 1;
  END IF;

  RETURN v_q;
END;
$$;


/*
 * Exact integer square root when p_value is a perfect
 * square. NULL otherwise.
 *
 * No sqrt().
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_exact_square_root_numeric_private_v1(
    p_value numeric
  )
RETURNS numeric
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
          'CING_ARTILLERY_SEGMENT_EVENT_SQUARE_ROOT_INVALID';
  END IF;

  IF p_value < 2 THEN
    RETURN p_value;
  END IF;

  v_x :=
    p_value;

  LOOP
    v_y :=
      div(
        v_x +
        div(
          p_value,
          v_x
        ),
        2
      );

    EXIT WHEN v_y >= v_x;

    v_x :=
      v_y;
  END LOOP;

  IF v_x * v_x =
       p_value
  THEN
    RETURN v_x;
  END IF;

  RETURN NULL;
END;
$$;


/*
 * Canonical rational ContactParameterV1 constructor.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_make_contact_rational_private_v1(
    p_numerator numeric,
    p_denominator numeric
  )
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_n numeric;
  v_d numeric;
  v_gcd numeric;
BEGIN
  IF p_numerator IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR p_denominator IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR trunc(p_numerator) <> p_numerator
     OR trunc(p_denominator) <> p_denominator
     OR p_denominator = 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SEGMENT_EVENT_RATIONAL_INVALID';
  END IF;

  v_n :=
    p_numerator;

  v_d :=
    p_denominator;

  IF v_d < 0 THEN
    v_n :=
      -v_n;

    v_d :=
      -v_d;
  END IF;

  IF v_n < 0
     OR v_n > v_d
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SEGMENT_EVENT_RATIONAL_OUTSIDE_SEGMENT';
  END IF;

  IF v_n = 0 THEN
    RETURN jsonb_build_object(
      'kind',
      'rational',

      'numerator',
      '0',

      'denominator',
      '1'
    );
  END IF;

  IF v_n = v_d THEN
    RETURN jsonb_build_object(
      'kind',
      'rational',

      'numerator',
      '1',

      'denominator',
      '1'
    );
  END IF;

  v_gcd :=
    public.cing_artillery_gcd_numeric_private_v1(
      v_n,
      v_d
    );

  IF v_gcd <= 0 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SEGMENT_EVENT_RATIONAL_GCD_INVALID';
  END IF;

  v_n :=
    div(
      v_n,
      v_gcd
    );

  v_d :=
    div(
      v_d,
      v_gcd
    );

  RETURN jsonb_build_object(
    'kind',
    'rational',

    'numerator',
    v_n::text,

    'denominator',
    v_d::text
  );
END;
$$;


/*
 * Canonical quadratic lower-root ContactParameterV1
 * constructor.
 *
 * Perfect-square discriminants collapse to rational form,
 * exactly matching JS canonicalization.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_make_contact_quadratic_private_v1(
    p_a numeric,
    p_b numeric,
    p_discriminant numeric
  )
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sqrt numeric;
  v_n numeric;
  v_d numeric;
BEGIN
  IF p_a IN (
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
     OR trunc(p_a) <> p_a
     OR trunc(p_b) <> p_b
     OR trunc(p_discriminant) <>
        p_discriminant
     OR p_a <= 0
     OR p_discriminant < 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SEGMENT_EVENT_QUADRATIC_INVALID';
  END IF;

  v_sqrt :=
    public.cing_artillery_exact_square_root_numeric_private_v1(
      p_discriminant
    );

  IF v_sqrt IS NOT NULL THEN
    v_n :=
      -p_b -
      v_sqrt;

    v_d :=
      2 * p_a;

    RETURN
      public.cing_artillery_make_contact_rational_private_v1(
        v_n,
        v_d
      );
  END IF;

  IF public.cing_artillery_validate_contact_parameter_private_v1(
       'quadratic_lower_root',
       NULL,
       NULL,
       p_a,
       p_b,
       p_discriminant
     )
     IS NOT TRUE
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SEGMENT_EVENT_QUADRATIC_OUTSIDE_SEGMENT';
  END IF;

  RETURN jsonb_build_object(
    'kind',
    'quadratic_lower_root',

    'a',
    p_a::text,

    'b',
    p_b::text,

    'discriminant',
    p_discriminant::text
  );
END;
$$;


/*
 * Exact sign of:
 *
 *   c + sqrt(x) - sqrt(y)
 *
 * Used only for quadratic-vs-quadratic contact ordering.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_sign_integer_plus_sqrt_minus_sqrt_private_v1(
    p_integer numeric,
    p_positive_radicand numeric,
    p_negative_radicand numeric
  )
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_c numeric;
  v_x numeric;
  v_y numeric;
  v_d numeric;
  v_k numeric;
  v_left numeric;
  v_right numeric;
BEGIN
  IF p_integer IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR p_positive_radicand IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR p_negative_radicand IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     OR trunc(p_integer) <>
        p_integer
     OR trunc(p_positive_radicand) <>
        p_positive_radicand
     OR trunc(p_negative_radicand) <>
        p_negative_radicand
     OR p_positive_radicand < 0
     OR p_negative_radicand < 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SEGMENT_EVENT_RADICAL_COMPARE_INVALID';
  END IF;

  v_c :=
    p_integer;

  v_x :=
    p_positive_radicand;

  v_y :=
    p_negative_radicand;

  IF v_c = 0 THEN
    IF v_x < v_y THEN
      RETURN -1;
    ELSIF v_x > v_y THEN
      RETURN 1;
    END IF;

    RETURN 0;
  END IF;

  IF v_c > 0 THEN
    IF v_x >= v_y THEN
      RETURN 1;
    END IF;

    v_k :=
      v_y -
      v_x -
      v_c * v_c;

    IF v_k <= 0 THEN
      RETURN 1;
    END IF;

    v_left :=
      4 *
      v_c *
      v_c *
      v_x;

    v_right :=
      v_k *
      v_k;

    IF v_left < v_right THEN
      RETURN -1;
    ELSIF v_left > v_right THEN
      RETURN 1;
    END IF;

    RETURN 0;
  END IF;

  v_d :=
    -v_c;

  IF v_x <= v_y THEN
    RETURN -1;
  END IF;

  v_k :=
    v_x -
    v_y -
    v_d * v_d;

  IF v_k <= 0 THEN
    RETURN -1;
  END IF;

  v_left :=
    v_k *
    v_k;

  v_right :=
    4 *
    v_d *
    v_d *
    v_y;

  IF v_left < v_right THEN
    RETURN -1;
  ELSIF v_left > v_right THEN
    RETURN 1;
  END IF;

  RETURN 0;
END;
$$;


/*
 * Exact ContactParameterV1 comparator.
 *
 * rational <-> rational
 * rational <-> quadratic
 * quadratic <-> quadratic
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_compare_contact_parameters_private_v1(
    p_left jsonb,
    p_right jsonb
  )
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_l_kind text;
  v_r_kind text;

  v_left_numerator numeric;
  v_left_denominator numeric;
  v_left_a numeric;
  v_left_b numeric;
  v_left_discriminant numeric;

  v_right_numerator numeric;
  v_right_denominator numeric;
  v_right_a numeric;
  v_right_b numeric;
  v_right_discriminant numeric;

  v_s numeric;
  v_left_squared numeric;
  v_right_squared numeric;

  v_c numeric;
  v_x numeric;
  v_y numeric;

  v_result integer;
BEGIN
  IF jsonb_typeof(p_left) <>
       'object'
     OR jsonb_typeof(p_right) <>
        'object'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SEGMENT_EVENT_CONTACT_COMPARE_SHAPE_INVALID';
  END IF;

  v_l_kind :=
    p_left ->> 'kind';

  v_r_kind :=
    p_right ->> 'kind';

  IF v_l_kind =
       'rational'
  THEN
    BEGIN
      v_left_numerator :=
        (p_left ->> 'numerator')::numeric;

      v_left_denominator :=
        (p_left ->> 'denominator')::numeric;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION
          USING
            ERRCODE = '22023',
            MESSAGE =
              'CING_ARTILLERY_SEGMENT_EVENT_LEFT_CONTACT_INVALID';
    END;

    IF public.cing_artillery_validate_contact_parameter_private_v1(
         'rational',
         v_left_numerator,
         v_left_denominator,
         NULL,
         NULL,
         NULL
       )
       IS NOT TRUE
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_SEGMENT_EVENT_LEFT_CONTACT_NOT_CANONICAL';
    END IF;

  ELSIF v_l_kind =
          'quadratic_lower_root'
  THEN
    BEGIN
      v_left_a :=
        (p_left ->> 'a')::numeric;

      v_left_b :=
        (p_left ->> 'b')::numeric;

      v_left_discriminant :=
        (p_left ->> 'discriminant')::numeric;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION
          USING
            ERRCODE = '22023',
            MESSAGE =
              'CING_ARTILLERY_SEGMENT_EVENT_LEFT_CONTACT_INVALID';
    END;

    IF public.cing_artillery_validate_contact_parameter_private_v1(
         'quadratic_lower_root',
         NULL,
         NULL,
         v_left_a,
         v_left_b,
         v_left_discriminant
       )
       IS NOT TRUE
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_SEGMENT_EVENT_LEFT_CONTACT_NOT_CANONICAL';
    END IF;

  ELSE
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SEGMENT_EVENT_LEFT_CONTACT_KIND_INVALID';
  END IF;


  IF v_r_kind =
       'rational'
  THEN
    BEGIN
      v_right_numerator :=
        (p_right ->> 'numerator')::numeric;

      v_right_denominator :=
        (p_right ->> 'denominator')::numeric;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION
          USING
            ERRCODE = '22023',
            MESSAGE =
              'CING_ARTILLERY_SEGMENT_EVENT_RIGHT_CONTACT_INVALID';
    END;

    IF public.cing_artillery_validate_contact_parameter_private_v1(
         'rational',
         v_right_numerator,
         v_right_denominator,
         NULL,
         NULL,
         NULL
       )
       IS NOT TRUE
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_SEGMENT_EVENT_RIGHT_CONTACT_NOT_CANONICAL';
    END IF;

  ELSIF v_r_kind =
          'quadratic_lower_root'
  THEN
    BEGIN
      v_right_a :=
        (p_right ->> 'a')::numeric;

      v_right_b :=
        (p_right ->> 'b')::numeric;

      v_right_discriminant :=
        (p_right ->> 'discriminant')::numeric;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION
          USING
            ERRCODE = '22023',
            MESSAGE =
              'CING_ARTILLERY_SEGMENT_EVENT_RIGHT_CONTACT_INVALID';
    END;

    IF public.cing_artillery_validate_contact_parameter_private_v1(
         'quadratic_lower_root',
         NULL,
         NULL,
         v_right_a,
         v_right_b,
         v_right_discriminant
       )
       IS NOT TRUE
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_SEGMENT_EVENT_RIGHT_CONTACT_NOT_CANONICAL';
    END IF;

  ELSE
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SEGMENT_EVENT_RIGHT_CONTACT_KIND_INVALID';
  END IF;


  IF v_l_kind =
       'rational'
     AND v_r_kind =
         'rational'
  THEN
    v_left_squared :=
      v_left_numerator *
      v_right_denominator;

    v_right_squared :=
      v_right_numerator *
      v_left_denominator;

    IF v_left_squared <
         v_right_squared
    THEN
      RETURN -1;
    ELSIF v_left_squared >
            v_right_squared
    THEN
      RETURN 1;
    END IF;

    RETURN 0;
  END IF;


  IF v_l_kind =
       'quadratic_lower_root'
     AND v_r_kind =
         'rational'
  THEN
    v_s :=
      -v_left_b *
      v_right_denominator
      -
      2 *
      v_left_a *
      v_right_numerator;

    IF v_s < 0 THEN
      RETURN -1;
    END IF;

    v_left_squared :=
      v_s *
      v_s;

    v_right_squared :=
      v_right_denominator *
      v_right_denominator *
      v_left_discriminant;

    IF v_left_squared <
         v_right_squared
    THEN
      RETURN -1;
    ELSIF v_left_squared >
            v_right_squared
    THEN
      RETURN 1;
    END IF;

    RETURN 0;
  END IF;


  IF v_l_kind =
       'rational'
     AND v_r_kind =
         'quadratic_lower_root'
  THEN
    v_result :=
      public.cing_artillery_compare_contact_parameters_private_v1(
        p_right,
        p_left
      );

    RETURN -v_result;
  END IF;


  v_c :=
    v_left_a *
    v_right_b
    -
    v_right_a *
    v_left_b;

  v_x :=
    v_left_a *
    v_left_a *
    v_right_discriminant;

  v_y :=
    v_right_a *
    v_right_a *
    v_left_discriminant;

  RETURN
    public.cing_artillery_sign_integer_plus_sqrt_minus_sqrt_private_v1(
      v_c,
      v_x,
      v_y
    );
END;
$$;


/*
 * Exact earliest contact against a closed circle.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_segment_circle_earliest_contact_private_v1(
    p_start_x numeric,
    p_start_y numeric,
    p_end_x numeric,
    p_end_y numeric,
    p_circle_x numeric,
    p_circle_y numeric,
    p_radius numeric
  )
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_dx numeric;
  v_dy numeric;

  v_fx numeric;
  v_fy numeric;

  v_radius_squared numeric;

  v_a numeric;
  v_b numeric;
  v_c numeric;
  v_D numeric;

  v_sqrt numeric;
  v_root_n numeric;
  v_root_d numeric;
BEGIN
  IF trunc(p_start_x) <> p_start_x
     OR trunc(p_start_y) <> p_start_y
     OR trunc(p_end_x) <> p_end_x
     OR trunc(p_end_y) <> p_end_y
     OR trunc(p_circle_x) <> p_circle_x
     OR trunc(p_circle_y) <> p_circle_y
     OR trunc(p_radius) <> p_radius
     OR p_radius <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SEGMENT_CIRCLE_INPUT_INVALID';
  END IF;

  v_radius_squared :=
    p_radius *
    p_radius;

  v_fx :=
    p_start_x -
    p_circle_x;

  v_fy :=
    p_start_y -
    p_circle_y;

  IF v_fx * v_fx +
     v_fy * v_fy <=
       v_radius_squared
  THEN
    RETURN
      public.cing_artillery_make_contact_rational_private_v1(
        0,
        1
      );
  END IF;

  v_dx :=
    p_end_x -
    p_start_x;

  v_dy :=
    p_end_y -
    p_start_y;

  v_a :=
    v_dx * v_dx +
    v_dy * v_dy;

  IF v_a = 0 THEN
    RETURN NULL;
  END IF;

  v_b :=
    2 *
    (
      v_dx * v_fx +
      v_dy * v_fy
    );

  v_c :=
    v_fx * v_fx +
    v_fy * v_fy -
    v_radius_squared;

  v_D :=
    v_b * v_b -
    4 *
    v_a *
    v_c;

  IF v_D < 0 THEN
    RETURN NULL;
  END IF;

  v_sqrt :=
    public.cing_artillery_exact_square_root_numeric_private_v1(
      v_D
    );

  IF v_sqrt IS NOT NULL THEN
    v_root_n :=
      -v_b -
      v_sqrt;

    v_root_d :=
      2 *
      v_a;

    IF v_root_n < 0
       OR v_root_n >
          v_root_d
    THEN
      RETURN NULL;
    END IF;

    RETURN
      public.cing_artillery_make_contact_rational_private_v1(
        v_root_n,
        v_root_d
      );
  END IF;

  IF public.cing_artillery_validate_contact_parameter_private_v1(
       'quadratic_lower_root',
       NULL,
       NULL,
       v_a,
       v_b,
       v_D
     )
     IS NOT TRUE
  THEN
    RETURN NULL;
  END IF;

  RETURN
    public.cing_artillery_make_contact_quadratic_private_v1(
      v_a,
      v_b,
      v_D
    );
END;
$$;


/*
 * Exact closed-AABB entry parameter.
 *
 * Complete slab intersection is evaluated, so a lower bound
 * is never returned for disjoint axis intervals.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_segment_closed_aabb_earliest_private_v1(
    p_start_x numeric,
    p_start_y numeric,
    p_end_x numeric,
    p_end_y numeric,
    p_min_x numeric,
    p_min_y numeric,
    p_max_x numeric,
    p_max_y numeric
  )
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_dx numeric;
  v_dy numeric;

  v_lower_n numeric := 0;
  v_lower_d numeric := 1;

  v_upper_n numeric := 1;
  v_upper_d numeric := 1;

  v_e1_n numeric;
  v_e1_d numeric;

  v_e2_n numeric;
  v_e2_d numeric;

  v_tmp_n numeric;
  v_tmp_d numeric;
BEGIN
  IF p_min_x > p_max_x
     OR p_min_y > p_max_y
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SEGMENT_AABB_INVALID';
  END IF;

  IF p_start_x >= p_min_x
     AND p_start_x <= p_max_x
     AND p_start_y >= p_min_y
     AND p_start_y <= p_max_y
  THEN
    RETURN
      public.cing_artillery_make_contact_rational_private_v1(
        0,
        1
      );
  END IF;

  v_dx :=
    p_end_x -
    p_start_x;

  v_dy :=
    p_end_y -
    p_start_y;


  IF v_dx = 0 THEN
    IF p_start_x < p_min_x
       OR p_start_x > p_max_x
    THEN
      RETURN NULL;
    END IF;
  ELSE
    v_e1_n :=
      p_min_x -
      p_start_x;

    v_e1_d :=
      v_dx;

    v_e2_n :=
      p_max_x -
      p_start_x;

    v_e2_d :=
      v_dx;

    IF v_e1_d < 0 THEN
      v_e1_n := -v_e1_n;
      v_e1_d := -v_e1_d;
    END IF;

    IF v_e2_d < 0 THEN
      v_e2_n := -v_e2_n;
      v_e2_d := -v_e2_d;
    END IF;

    IF v_e1_n * v_e2_d >
       v_e2_n * v_e1_d
    THEN
      v_tmp_n := v_e1_n;
      v_tmp_d := v_e1_d;

      v_e1_n := v_e2_n;
      v_e1_d := v_e2_d;

      v_e2_n := v_tmp_n;
      v_e2_d := v_tmp_d;
    END IF;

    IF v_e1_n * v_lower_d >
       v_lower_n * v_e1_d
    THEN
      v_lower_n := v_e1_n;
      v_lower_d := v_e1_d;
    END IF;

    IF v_e2_n * v_upper_d <
       v_upper_n * v_e2_d
    THEN
      v_upper_n := v_e2_n;
      v_upper_d := v_e2_d;
    END IF;
  END IF;


  IF v_dy = 0 THEN
    IF p_start_y < p_min_y
       OR p_start_y > p_max_y
    THEN
      RETURN NULL;
    END IF;
  ELSE
    v_e1_n :=
      p_min_y -
      p_start_y;

    v_e1_d :=
      v_dy;

    v_e2_n :=
      p_max_y -
      p_start_y;

    v_e2_d :=
      v_dy;

    IF v_e1_d < 0 THEN
      v_e1_n := -v_e1_n;
      v_e1_d := -v_e1_d;
    END IF;

    IF v_e2_d < 0 THEN
      v_e2_n := -v_e2_n;
      v_e2_d := -v_e2_d;
    END IF;

    IF v_e1_n * v_e2_d >
       v_e2_n * v_e1_d
    THEN
      v_tmp_n := v_e1_n;
      v_tmp_d := v_e1_d;

      v_e1_n := v_e2_n;
      v_e1_d := v_e2_d;

      v_e2_n := v_tmp_n;
      v_e2_d := v_tmp_d;
    END IF;

    IF v_e1_n * v_lower_d >
       v_lower_n * v_e1_d
    THEN
      v_lower_n := v_e1_n;
      v_lower_d := v_e1_d;
    END IF;

    IF v_e2_n * v_upper_d <
       v_upper_n * v_e2_d
    THEN
      v_upper_n := v_e2_n;
      v_upper_d := v_e2_d;
    END IF;
  END IF;


  IF v_lower_n * v_upper_d >
       v_upper_n * v_lower_d
     OR v_upper_n < 0
     OR v_lower_n >
        v_lower_d
  THEN
    RETURN NULL;
  END IF;

  IF v_lower_n < 0 THEN
    v_lower_n := 0;
    v_lower_d := 1;
  END IF;

  RETURN
    public.cing_artillery_make_contact_rational_private_v1(
      v_lower_n,
      v_lower_d
    );
END;
$$;


/*
 * Exact earliest contact against one projectile-radius
 * expanded closed pixel cell.
 *
 * Six components:
 *
 *   horizontal strip
 *   vertical strip
 *   four corner circles
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_segment_rounded_pixel_cell_earliest_private_v1(
    p_start_x numeric,
    p_start_y numeric,
    p_end_x numeric,
    p_end_y numeric,
    p_radius numeric,
    p_cell_x numeric,
    p_cell_y numeric,
    p_scale numeric
  )
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_min_x numeric;
  v_min_y numeric;
  v_max_x numeric;
  v_max_y numeric;

  v_earliest jsonb;
  v_candidate jsonb;

  v_corner_x numeric;
  v_corner_y numeric;
BEGIN
  IF trunc(p_radius) <> p_radius
     OR trunc(p_cell_x) <> p_cell_x
     OR trunc(p_cell_y) <> p_cell_y
     OR trunc(p_scale) <> p_scale
     OR p_radius <= 0
     OR p_scale <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_ROUNDED_PIXEL_CELL_INPUT_INVALID';
  END IF;

  v_min_x :=
    p_cell_x *
    p_scale;

  v_min_y :=
    p_cell_y *
    p_scale;

  v_max_x :=
    (p_cell_x + 1) *
    p_scale;

  v_max_y :=
    (p_cell_y + 1) *
    p_scale;


  v_earliest :=
    public.cing_artillery_segment_closed_aabb_earliest_private_v1(
      p_start_x,
      p_start_y,
      p_end_x,
      p_end_y,

      v_min_x,
      v_min_y - p_radius,
      v_max_x,
      v_max_y + p_radius
    );


  v_candidate :=
    public.cing_artillery_segment_closed_aabb_earliest_private_v1(
      p_start_x,
      p_start_y,
      p_end_x,
      p_end_y,

      v_min_x - p_radius,
      v_min_y,
      v_max_x + p_radius,
      v_max_y
    );

  IF v_candidate IS NOT NULL
     AND (
       v_earliest IS NULL
       OR
       public.cing_artillery_compare_contact_parameters_private_v1(
         v_candidate,
         v_earliest
       ) < 0
     )
  THEN
    v_earliest :=
      v_candidate;
  END IF;


  FOR v_corner_x, v_corner_y IN
    VALUES
      (v_min_x, v_min_y),
      (v_max_x, v_min_y),
      (v_min_x, v_max_y),
      (v_max_x, v_max_y)
  LOOP
    v_candidate :=
      public.cing_artillery_segment_circle_earliest_contact_private_v1(
        p_start_x,
        p_start_y,
        p_end_x,
        p_end_y,

        v_corner_x,
        v_corner_y,
        p_radius
      );

    IF v_candidate IS NOT NULL
       AND (
         v_earliest IS NULL
         OR
         public.cing_artillery_compare_contact_parameters_private_v1(
           v_candidate,
           v_earliest
         ) < 0
       )
    THEN
      v_earliest :=
        v_candidate;
    END IF;
  END LOOP;

  RETURN v_earliest;
END;
$$;


/*
 * Exact global earliest terrain contact.
 *
 * The bitmask is validated ONCE.
 *
 * Candidate iteration order has no authority: every solid
 * candidate participates and the exact global minimum wins.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_swept_terrain_earliest_private_v1(
    p_start_x numeric,
    p_start_y numeric,
    p_end_x numeric,
    p_end_y numeric,

    p_projectile_radius numeric,
    p_scale numeric,

    p_width_px integer,
    p_height_px integer,
    p_collision_mask bytea
  )
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_min_center_x numeric;
  v_max_center_x numeric;
  v_min_center_y numeric;
  v_max_center_y numeric;

  v_min_x numeric;
  v_max_x numeric;
  v_min_y numeric;
  v_max_y numeric;

  v_x numeric;
  v_y numeric;

  v_bytes_per_row bigint;
  v_byte_offset bigint;
  v_bit_index integer;
  v_byte integer;

  v_candidate jsonb;
  v_earliest jsonb;
BEGIN
  IF trunc(p_projectile_radius) <>
       p_projectile_radius
     OR trunc(p_scale) <>
        p_scale
     OR p_projectile_radius <= 0
     OR p_scale <= 0
     OR p_width_px <= 0
     OR p_height_px <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_TERRAIN_EARLIEST_INPUT_INVALID';
  END IF;

  IF public.cing_artillery_validate_collision_bitmask_v1(
       p_width_px,
       p_height_px,
       p_collision_mask
     )
     IS NOT TRUE
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_TERRAIN_EARLIEST_BITMASK_INVALID';
  END IF;


  v_min_center_x :=
    LEAST(
      p_start_x,
      p_end_x
    );

  v_max_center_x :=
    GREATEST(
      p_start_x,
      p_end_x
    );

  v_min_center_y :=
    LEAST(
      p_start_y,
      p_end_y
    );

  v_max_center_y :=
    GREATEST(
      p_start_y,
      p_end_y
    );


  v_min_x :=
    public.cing_artillery_floor_div_numeric_private_v1(
      v_min_center_x -
      p_projectile_radius -
      1,
      p_scale
    );

  v_max_x :=
    public.cing_artillery_floor_div_numeric_private_v1(
      v_max_center_x +
      p_projectile_radius,
      p_scale
    );

  v_min_y :=
    public.cing_artillery_floor_div_numeric_private_v1(
      v_min_center_y -
      p_projectile_radius -
      1,
      p_scale
    );

  v_max_y :=
    public.cing_artillery_floor_div_numeric_private_v1(
      v_max_center_y +
      p_projectile_radius,
      p_scale
    );


  v_min_x :=
    GREATEST(
      v_min_x,
      0
    );

  v_min_y :=
    GREATEST(
      v_min_y,
      0
    );

  v_max_x :=
    LEAST(
      v_max_x,
      p_width_px - 1
    );

  v_max_y :=
    LEAST(
      v_max_y,
      p_height_px - 1
    );


  IF v_min_x > v_max_x
     OR v_min_y > v_max_y
  THEN
    RETURN NULL;
  END IF;


  v_bytes_per_row :=
    (
      p_width_px::bigint +
      7
    ) / 8;


  v_y :=
    v_min_y;

  WHILE v_y <= v_max_y LOOP
    v_x :=
      v_min_x;

    WHILE v_x <= v_max_x LOOP
      v_byte_offset :=
        v_y::bigint *
        v_bytes_per_row
        +
        div(
          v_x,
          8
        )::bigint;

      v_bit_index :=
        (
          7 -
          mod(
            v_x,
            8
          )
        )::integer;

      v_byte :=
        get_byte(
          p_collision_mask,
          v_byte_offset::integer
        );

      IF (
           v_byte
           &
           (1 << v_bit_index)
         ) <> 0
      THEN
        v_candidate :=
          public.cing_artillery_segment_rounded_pixel_cell_earliest_private_v1(
            p_start_x,
            p_start_y,
            p_end_x,
            p_end_y,

            p_projectile_radius,

            v_x,
            v_y,

            p_scale
          );

        IF v_candidate IS NOT NULL
           AND (
             v_earliest IS NULL
             OR
             public.cing_artillery_compare_contact_parameters_private_v1(
               v_candidate,
               v_earliest
             ) < 0
           )
        THEN
          v_earliest :=
            v_candidate;
        END IF;
      END IF;

      v_x :=
        v_x + 1;
    END LOOP;

    v_y :=
      v_y + 1;
  END LOOP;

  RETURN v_earliest;
END;
$$;


/*
 * Exact closed-AABB EXIT parameter.
 *
 * Contract:
 *
 *   start must be inside/on
 *   end inside/on -> NULL
 *   end outside   -> exact upper slab boundary
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_segment_closed_aabb_exit_private_v1(
    p_start_x numeric,
    p_start_y numeric,
    p_end_x numeric,
    p_end_y numeric,

    p_min_x numeric,
    p_min_y numeric,
    p_max_x numeric,
    p_max_y numeric
  )
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_dx numeric;
  v_dy numeric;

  v_upper_n numeric := 1;
  v_upper_d numeric := 1;

  v_exit_n numeric;
  v_exit_d numeric;
BEGIN
  IF p_min_x > p_max_x
     OR p_min_y > p_max_y
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SEGMENT_EXIT_AABB_INVALID';
  END IF;

  IF NOT (
       p_start_x >= p_min_x
       AND p_start_x <= p_max_x
       AND p_start_y >= p_min_y
       AND p_start_y <= p_max_y
     )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SEGMENT_EXIT_START_OUTSIDE';
  END IF;

  IF p_end_x >= p_min_x
     AND p_end_x <= p_max_x
     AND p_end_y >= p_min_y
     AND p_end_y <= p_max_y
  THEN
    RETURN NULL;
  END IF;

  v_dx :=
    p_end_x -
    p_start_x;

  v_dy :=
    p_end_y -
    p_start_y;

  IF v_dx = 0
     AND v_dy = 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SEGMENT_EXIT_STATIONARY_INVARIANT';
  END IF;


  IF v_dx > 0 THEN
    v_exit_n :=
      p_max_x -
      p_start_x;

    v_exit_d :=
      v_dx;

    IF v_exit_n * v_upper_d <
       v_upper_n * v_exit_d
    THEN
      v_upper_n := v_exit_n;
      v_upper_d := v_exit_d;
    END IF;

  ELSIF v_dx < 0 THEN
    v_exit_n :=
      p_start_x -
      p_min_x;

    v_exit_d :=
      -v_dx;

    IF v_exit_n * v_upper_d <
       v_upper_n * v_exit_d
    THEN
      v_upper_n := v_exit_n;
      v_upper_d := v_exit_d;
    END IF;
  END IF;


  IF v_dy > 0 THEN
    v_exit_n :=
      p_max_y -
      p_start_y;

    v_exit_d :=
      v_dy;

    IF v_exit_n * v_upper_d <
       v_upper_n * v_exit_d
    THEN
      v_upper_n := v_exit_n;
      v_upper_d := v_exit_d;
    END IF;

  ELSIF v_dy < 0 THEN
    v_exit_n :=
      p_start_y -
      p_min_y;

    v_exit_d :=
      -v_dy;

    IF v_exit_n * v_upper_d <
       v_upper_n * v_exit_d
    THEN
      v_upper_n := v_exit_n;
      v_upper_d := v_exit_d;
    END IF;
  END IF;


  RETURN
    public.cing_artillery_make_contact_rational_private_v1(
      v_upper_n,
      v_upper_d
    );
END;
$$;


/*
 * Final exact event for ONE canonical trajectory segment.
 *
 * Output:
 *
 * collision:
 *
 *   {
 *     segment_event_kind: "collision",
 *     collision_kind: "player" | "terrain",
 *     world_exit_kind: null,
 *     contact_parameter: ContactParameterV1
 *   }
 *
 * world exit:
 *
 *   {
 *     segment_event_kind: "world_exit",
 *     collision_kind: null,
 *     world_exit_kind:
 *       "boundary_exit" | "already_outside",
 *     contact_parameter: ContactParameterV1
 *   }
 *
 * NULL means no collision and no world exit on this segment.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_classify_segment_event_private_v1(
    p_start_x_scaled bigint,
    p_start_y_scaled bigint,
    p_end_x_scaled bigint,
    p_end_y_scaled bigint,

    p_projectile_radius_scaled bigint,

    p_player_center_x_scaled bigint,
    p_player_center_y_scaled bigint,
    p_player_radius_scaled bigint,

    p_physics_fixed_scale bigint,

    p_width_px integer,
    p_height_px integer,
    p_collision_mask bytea
  )
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_start_x numeric;
  v_start_y numeric;
  v_end_x numeric;
  v_end_y numeric;

  v_projectile_radius numeric;
  v_player_radius numeric;
  v_combined_player_radius numeric;
  v_scale numeric;

  v_player_contact jsonb;
  v_terrain_contact jsonb;

  v_collision_kind text;
  v_collision_contact jsonb;

  v_world_min_x numeric;
  v_world_min_y numeric;
  v_world_max_x numeric;
  v_world_max_y numeric;

  v_start_inside_world boolean;
  v_end_inside_world boolean;

  v_world_exit_kind text;
  v_world_exit_contact jsonb;

  v_comparison integer;
BEGIN
  IF p_projectile_radius_scaled <= 0
     OR p_player_radius_scaled <= 0
     OR p_physics_fixed_scale <= 0
     OR p_width_px <= 0
     OR p_height_px <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SEGMENT_EVENT_INPUT_INVALID';
  END IF;


  v_start_x :=
    p_start_x_scaled::numeric;

  v_start_y :=
    p_start_y_scaled::numeric;

  v_end_x :=
    p_end_x_scaled::numeric;

  v_end_y :=
    p_end_y_scaled::numeric;

  v_projectile_radius :=
    p_projectile_radius_scaled::numeric;

  v_player_radius :=
    p_player_radius_scaled::numeric;

  v_scale :=
    p_physics_fixed_scale::numeric;

  v_combined_player_radius :=
    v_projectile_radius +
    v_player_radius;


  /*
   * Both player and terrain authorities are evaluated before
   * precedence, matching JS validation semantics.
   */
  v_player_contact :=
    public.cing_artillery_segment_circle_earliest_contact_private_v1(
      v_start_x,
      v_start_y,
      v_end_x,
      v_end_y,

      p_player_center_x_scaled::numeric,
      p_player_center_y_scaled::numeric,

      v_combined_player_radius
    );


  v_terrain_contact :=
    public.cing_artillery_swept_terrain_earliest_private_v1(
      v_start_x,
      v_start_y,
      v_end_x,
      v_end_y,

      v_projectile_radius,
      v_scale,

      p_width_px,
      p_height_px,
      p_collision_mask
    );


  /*
   * Player / terrain precedence.
   *
   * PLAYER wins exact ties.
   */
  IF v_player_contact IS NULL
     AND v_terrain_contact IS NULL
  THEN
    v_collision_kind :=
      NULL;

    v_collision_contact :=
      NULL;

  ELSIF v_terrain_contact IS NULL
  THEN
    v_collision_kind :=
      'player';

    v_collision_contact :=
      v_player_contact;

  ELSIF v_player_contact IS NULL
  THEN
    v_collision_kind :=
      'terrain';

    v_collision_contact :=
      v_terrain_contact;

  ELSE
    v_comparison :=
      public.cing_artillery_compare_contact_parameters_private_v1(
        v_player_contact,
        v_terrain_contact
      );

    IF v_comparison <= 0 THEN
      v_collision_kind :=
        'player';

      v_collision_contact :=
        v_player_contact;
    ELSE
      v_collision_kind :=
        'terrain';

      v_collision_contact :=
        v_terrain_contact;
    END IF;
  END IF;


  /*
   * Expanded closed world:
   *
   * [-r, width*scale+r]
   * ×
   * [-r, height*scale+r]
   */
  v_world_min_x :=
    -v_projectile_radius;

  v_world_min_y :=
    -v_projectile_radius;

  v_world_max_x :=
    p_width_px::numeric *
    v_scale
    +
    v_projectile_radius;

  v_world_max_y :=
    p_height_px::numeric *
    v_scale
    +
    v_projectile_radius;


  v_start_inside_world :=
    v_start_x >= v_world_min_x
    AND
    v_start_x <= v_world_max_x
    AND
    v_start_y >= v_world_min_y
    AND
    v_start_y <= v_world_max_y;


  v_end_inside_world :=
    v_end_x >= v_world_min_x
    AND
    v_end_x <= v_world_max_x
    AND
    v_end_y >= v_world_min_y
    AND
    v_end_y <= v_world_max_y;


  /*
   * already_outside is semantically distinct from
   * boundary_exit and wins immediately at t=0.
   */
  IF NOT v_start_inside_world THEN
    v_world_exit_kind :=
      'already_outside';

    v_world_exit_contact :=
      public.cing_artillery_make_contact_rational_private_v1(
        0,
        1
      );

  ELSIF v_end_inside_world
  THEN
    v_world_exit_kind :=
      NULL;

    v_world_exit_contact :=
      NULL;

  ELSE
    v_world_exit_kind :=
      'boundary_exit';

    v_world_exit_contact :=
      public.cing_artillery_segment_closed_aabb_exit_private_v1(
        v_start_x,
        v_start_y,
        v_end_x,
        v_end_y,

        v_world_min_x,
        v_world_min_y,
        v_world_max_x,
        v_world_max_y
      );

    IF v_world_exit_contact IS NULL THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_SEGMENT_EVENT_WORLD_EXIT_INVARIANT';
    END IF;
  END IF;


  IF v_world_exit_kind =
       'already_outside'
  THEN
    RETURN jsonb_build_object(
      'segment_event_kind',
      'world_exit',

      'collision_kind',
      NULL,

      'world_exit_kind',
      'already_outside',

      'contact_parameter',
      v_world_exit_contact
    );
  END IF;


  IF v_collision_contact IS NULL
     AND v_world_exit_contact IS NULL
  THEN
    RETURN NULL;
  END IF;


  IF v_world_exit_contact IS NULL
  THEN
    RETURN jsonb_build_object(
      'segment_event_kind',
      'collision',

      'collision_kind',
      v_collision_kind,

      'world_exit_kind',
      NULL,

      'contact_parameter',
      v_collision_contact
    );
  END IF;


  IF v_collision_contact IS NULL
  THEN
    RETURN jsonb_build_object(
      'segment_event_kind',
      'world_exit',

      'collision_kind',
      NULL,

      'world_exit_kind',
      v_world_exit_kind,

      'contact_parameter',
      v_world_exit_contact
    );
  END IF;


  /*
   * Collision / boundary_exit precedence.
   *
   * COLLISION wins exact boundary ties because projectile
   * remains touching the CLOSED world at that parameter.
   */
  v_comparison :=
    public.cing_artillery_compare_contact_parameters_private_v1(
      v_collision_contact,
      v_world_exit_contact
    );

  IF v_comparison <= 0 THEN
    RETURN jsonb_build_object(
      'segment_event_kind',
      'collision',

      'collision_kind',
      v_collision_kind,

      'world_exit_kind',
      NULL,

      'contact_parameter',
      v_collision_contact
    );
  END IF;


  RETURN jsonb_build_object(
    'segment_event_kind',
    'world_exit',

    'collision_kind',
    NULL,

    'world_exit_kind',
    v_world_exit_kind,

    'contact_parameter',
    v_world_exit_contact
  );
END;
$$;


/*
 * =====================================================
 * PRIVATE ACL
 * =====================================================
 */

REVOKE ALL
ON FUNCTION
  public.cing_artillery_floor_div_numeric_private_v1(
    numeric,
    numeric
  )
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_exact_square_root_numeric_private_v1(
    numeric
  )
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_make_contact_rational_private_v1(
    numeric,
    numeric
  )
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_make_contact_quadratic_private_v1(
    numeric,
    numeric,
    numeric
  )
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_sign_integer_plus_sqrt_minus_sqrt_private_v1(
    numeric,
    numeric,
    numeric
  )
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_compare_contact_parameters_private_v1(
    jsonb,
    jsonb
  )
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_segment_circle_earliest_contact_private_v1(
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_segment_closed_aabb_earliest_private_v1(
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_segment_rounded_pixel_cell_earliest_private_v1(
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_swept_terrain_earliest_private_v1(
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    integer,
    integer,
    bytea
  )
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_segment_closed_aabb_exit_private_v1(
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric
  )
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_classify_segment_event_private_v1(
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    integer,
    integer,
    bytea
  )
FROM PUBLIC, anon, authenticated, service_role;


COMMIT;
