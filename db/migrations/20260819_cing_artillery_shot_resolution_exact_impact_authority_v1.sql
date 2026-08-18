BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- DURABLE EXACT IMPACT AUTHORITY V1
--
-- Purpose:
--
--   preserve the exact canonical projectile-center impact
--   representation in PostgreSQL before any finite NUMERIC
--   compatibility projection is introduced.
--
-- Exact V1 geometry:
--
--   x =
--     start_x_scaled +
--     delta_x_scaled * t
--
--   y =
--     start_y_scaled +
--     delta_y_scaled * t
--
-- where t is one canonical ContactParameterV1:
--
--   rational
--
--     numerator / denominator
--
-- or
--
--   quadratic_lower_root
--
--     (-b - sqrt(discriminant)) / (2a)
--
-- Why this authority is required:
--
--   A quadratic contact parameter may be irrational.
--
--   PostgreSQL NUMERIC cannot represent an irrational value
--   exactly as a finite decimal.
--
--   Therefore impact_x / impact_y must not become the source
--   of truth for Physics V1 collision geometry.
--
-- Canonical authority is the exact symbolic representation
-- added by this migration.
--
-- impact_x / impact_y remain reserved for a later
-- deterministic compatibility projection.
--
-- This migration intentionally does NOT:
--
--   choose decimal precision
--   choose rounding
--   approximate sqrt
--   populate impact_x / impact_y
--   create a writer RPC
--   mutate existing rows
--   calculate collision
--   calculate damage
--   mutate HP
-- =====================================================


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD COLUMN
  impact_exact_version integer;


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD COLUMN
  impact_physics_fixed_scale bigint;


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD COLUMN
  impact_start_x_scaled bigint;


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD COLUMN
  impact_start_y_scaled bigint;


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD COLUMN
  impact_delta_x_scaled bigint;


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD COLUMN
  impact_delta_y_scaled bigint;


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD COLUMN
  impact_contact_kind text;


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD COLUMN
  impact_contact_numerator numeric;


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD COLUMN
  impact_contact_denominator numeric;


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD COLUMN
  impact_contact_a numeric;


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD COLUMN
  impact_contact_b numeric;


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD COLUMN
  impact_contact_discriminant numeric;


-- =====================================================
-- SOLVER-LATTICE DOMAINS
-- =====================================================

ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD CONSTRAINT
  cing_artillery_shot_resolutions_impact_exact_scale_check
CHECK (
  impact_physics_fixed_scale IS NULL
  OR
  (
    impact_physics_fixed_scale > 0
    AND impact_physics_fixed_scale <=
      9007199254740991::bigint
  )
);


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD CONSTRAINT
  cing_artillery_shot_resolutions_impact_exact_scaled_coordinate_check
CHECK (
  (
    impact_start_x_scaled IS NULL
    AND impact_start_y_scaled IS NULL
    AND impact_delta_x_scaled IS NULL
    AND impact_delta_y_scaled IS NULL
  )
  OR
  (
    impact_start_x_scaled BETWEEN
      -9007199254740991::bigint
      AND
       9007199254740991::bigint

    AND impact_start_y_scaled BETWEEN
      -9007199254740991::bigint
      AND
       9007199254740991::bigint

    AND impact_delta_x_scaled BETWEEN
      -9007199254740991::bigint
      AND
       9007199254740991::bigint

    AND impact_delta_y_scaled BETWEEN
      -9007199254740991::bigint
      AND
       9007199254740991::bigint
  )
);


-- =====================================================
-- CONTACT PARAMETER INTEGER-NUMERIC DOMAIN
--
-- NUMERIC is used intentionally here rather than BIGINT:
--
-- exact rational / quadratic coefficients are BigInt values
-- in JavaScript and may exceed PostgreSQL int64.
-- =====================================================

ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD CONSTRAINT
  cing_artillery_shot_resolutions_impact_exact_contact_numeric_check
CHECK (
  (
    impact_contact_numerator IS NULL
    OR
    (
      impact_contact_numerator NOT IN (
        'NaN'::numeric,
        'Infinity'::numeric,
        '-Infinity'::numeric
      )
      AND impact_contact_numerator =
        trunc(impact_contact_numerator)
    )
  )

  AND

  (
    impact_contact_denominator IS NULL
    OR
    (
      impact_contact_denominator NOT IN (
        'NaN'::numeric,
        'Infinity'::numeric,
        '-Infinity'::numeric
      )
      AND impact_contact_denominator =
        trunc(impact_contact_denominator)
    )
  )

  AND

  (
    impact_contact_a IS NULL
    OR
    (
      impact_contact_a NOT IN (
        'NaN'::numeric,
        'Infinity'::numeric,
        '-Infinity'::numeric
      )
      AND impact_contact_a =
        trunc(impact_contact_a)
    )
  )

  AND

  (
    impact_contact_b IS NULL
    OR
    (
      impact_contact_b NOT IN (
        'NaN'::numeric,
        'Infinity'::numeric,
        '-Infinity'::numeric
      )
      AND impact_contact_b =
        trunc(impact_contact_b)
    )
  )

  AND

  (
    impact_contact_discriminant IS NULL
    OR
    (
      impact_contact_discriminant NOT IN (
        'NaN'::numeric,
        'Infinity'::numeric,
        '-Infinity'::numeric
      )
      AND impact_contact_discriminant =
        trunc(impact_contact_discriminant)
    )
  )
);


-- =====================================================
-- EXACT REPRESENTATION SHAPE
--
-- No-event / out-of-bounds durable shapes:
--
--   every exact-impact field NULL.
--
-- Collision durable shapes:
--
--   exact version = 1
--   scale and affine segment are present
--   contact representation is exactly one canonical form.
--
-- Full mathematical canonicalization is intentionally left
-- to the future fenced resolution writer, which will validate
-- the exact JS-produced representation before INSERT.
--
-- Schema still enforces structural impossibilities closed.
-- =====================================================

ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD CONSTRAINT
  cing_artillery_shot_resolutions_impact_exact_shape_check
CHECK (
  (
    impact_exact_version IS NULL

    AND impact_physics_fixed_scale IS NULL

    AND impact_start_x_scaled IS NULL
    AND impact_start_y_scaled IS NULL

    AND impact_delta_x_scaled IS NULL
    AND impact_delta_y_scaled IS NULL

    AND impact_contact_kind IS NULL

    AND impact_contact_numerator IS NULL
    AND impact_contact_denominator IS NULL

    AND impact_contact_a IS NULL
    AND impact_contact_b IS NULL
    AND impact_contact_discriminant IS NULL
  )
  OR
  (
    impact_exact_version = 1

    AND impact_physics_fixed_scale IS NOT NULL

    AND impact_start_x_scaled IS NOT NULL
    AND impact_start_y_scaled IS NOT NULL

    AND impact_delta_x_scaled IS NOT NULL
    AND impact_delta_y_scaled IS NOT NULL

    AND (
      (
        impact_contact_kind = 'rational'

        AND impact_contact_numerator IS NOT NULL
        AND impact_contact_denominator IS NOT NULL
        AND impact_contact_denominator > 0

        AND impact_contact_a IS NULL
        AND impact_contact_b IS NULL
        AND impact_contact_discriminant IS NULL
      )
      OR
      (
        impact_contact_kind = 'quadratic_lower_root'

        AND impact_contact_numerator IS NULL
        AND impact_contact_denominator IS NULL

        AND impact_contact_a IS NOT NULL
        AND impact_contact_a > 0

        AND impact_contact_b IS NOT NULL

        AND impact_contact_discriminant IS NOT NULL
        AND impact_contact_discriminant >= 0
      )
    )
  )
);


-- =====================================================
-- OUTCOME / EXACT IMPACT COUPLING
--
-- Existing durable semantics:
--
--   player_hit / terrain_hit
--     => collision impact exists
--
--   out_of_bounds
--     => no impact coordinates
--
-- Exact symbolic authority follows the same boundary.
-- =====================================================

ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD CONSTRAINT
  cing_artillery_shot_resolutions_impact_exact_outcome_check
CHECK (
  (
    outcome IN (
      'player_hit',
      'terrain_hit'
    )

    AND impact_exact_version = 1
  )
  OR
  (
    outcome = 'out_of_bounds'

    AND impact_exact_version IS NULL
  )
);


-- =====================================================
-- SEMANTIC DOCUMENTATION
-- =====================================================

COMMENT ON COLUMN
  public.cing_artillery_shot_resolutions.impact_exact_version
IS
  'Exact projectile-center impact representation version. Physics V1 collision authority uses version 1. NULL for out_of_bounds.';


COMMENT ON COLUMN
  public.cing_artillery_shot_resolutions.impact_physics_fixed_scale
IS
  'Positive canonical physics_fixed_scale associated with the exact scaled projectile-center impact representation.';


COMMENT ON COLUMN
  public.cing_artillery_shot_resolutions.impact_start_x_scaled
IS
  'Exact scaled projectile-center trajectory-segment start X used by the terminal collision representation.';


COMMENT ON COLUMN
  public.cing_artillery_shot_resolutions.impact_start_y_scaled
IS
  'Exact scaled projectile-center trajectory-segment start Y used by the terminal collision representation.';


COMMENT ON COLUMN
  public.cing_artillery_shot_resolutions.impact_delta_x_scaled
IS
  'Exact scaled terminal trajectory-segment delta X. Impact X is start_x_scaled + delta_x_scaled * exact contact parameter.';


COMMENT ON COLUMN
  public.cing_artillery_shot_resolutions.impact_delta_y_scaled
IS
  'Exact scaled terminal trajectory-segment delta Y. Impact Y is start_y_scaled + delta_y_scaled * exact contact parameter.';


COMMENT ON COLUMN
  public.cing_artillery_shot_resolutions.impact_contact_kind
IS
  'Exact canonical ContactParameterV1 kind: rational or quadratic_lower_root.';


COMMENT ON COLUMN
  public.cing_artillery_shot_resolutions.impact_x
IS
  'Deterministic NUMERIC compatibility projection of the canonical exact projectile-center impact authority. Signed finite value. Projection precision/rounding policy is defined separately and is not authority for collision geometry. NULL for out_of_bounds.';


COMMENT ON COLUMN
  public.cing_artillery_shot_resolutions.impact_y
IS
  'Deterministic NUMERIC compatibility projection of the canonical exact projectile-center impact authority. Signed finite value. Projection precision/rounding policy is defined separately and is not authority for collision geometry. NULL for out_of_bounds.';


COMMIT;
