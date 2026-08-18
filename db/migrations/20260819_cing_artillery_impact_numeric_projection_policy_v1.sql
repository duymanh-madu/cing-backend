BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- IMPACT NUMERIC PROJECTION POLICY V1
--
-- Canonical collision authority:
--
--   exact symbolic projectile-center impact representation
--   stored by Durable Exact Impact Authority V1.
--
-- impact_x / impact_y are compatibility projections only.
--
-- =====================================================
-- PROJECTION V1
-- =====================================================
--
-- Version:
--
--   1
--
-- Unit:
--
--   solver-space coordinate
--
--   exact scaled projectile-center coordinate
--   divided by physics_fixed_scale.
--
-- Decimal quantum:
--
--   0.000000000001
--
--   exactly 12 decimal places.
--
-- Rounding:
--
--   nearest
--
--   exact half ties away from zero.
--
-- Canonical transport serialization:
--
--   plain base-10 decimal
--   no exponent notation
--   no leading plus sign
--   no redundant leading integer zeros
--   redundant fractional trailing zeros removed
--   decimal point removed when fraction becomes empty
--   negative zero normalized to 0
--
-- IMPORTANT:
--
--   This finite projection never participates in:
--
--     collision detection
--     event precedence
--     target identity
--     blast-distance authority
--     damage authority
--
--   Those systems use the exact symbolic impact.
--
-- This migration defines durable projection POLICY only.
--
-- It does NOT:
--
--   approximate any quadratic root
--   calculate impact_x / impact_y
--   update existing rows
--   create writer authority
--   mutate gameplay
-- =====================================================


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD COLUMN
  impact_projection_version integer;


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD CONSTRAINT
  cing_artillery_shot_resolutions_impact_projection_version_check
CHECK (
  impact_projection_version IS NULL
  OR
  impact_projection_version = 1
);


-- =====================================================
-- FIXED DECIMAL GRID V1
--
-- PostgreSQL NUMERIC itself is arbitrary precision.
--
-- Projection V1 deliberately restricts persisted compatibility
-- values to the exact decimal lattice:
--
--   integer / 10^12
--
-- This check verifies grid membership only.
--
-- It does NOT calculate or round the exact impact.
-- =====================================================

ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD CONSTRAINT
  cing_artillery_shot_resolutions_impact_projection_decimal_grid_v1_check
CHECK (
  (
    impact_x IS NULL
    AND impact_y IS NULL
  )
  OR
  (
    impact_x IS NOT NULL
    AND impact_y IS NOT NULL

    AND impact_x NOT IN (
      'NaN'::numeric,
      'Infinity'::numeric,
      '-Infinity'::numeric
    )

    AND impact_y NOT IN (
      'NaN'::numeric,
      'Infinity'::numeric,
      '-Infinity'::numeric
    )

    AND
      impact_x * 1000000000000::numeric =
      trunc(
        impact_x * 1000000000000::numeric
      )

    AND
      impact_y * 1000000000000::numeric =
      trunc(
        impact_y * 1000000000000::numeric
      )
  )
);


-- =====================================================
-- OUTCOME / PROJECTION VERSION COUPLING
--
-- Existing durable semantics:
--
--   player_hit / terrain_hit
--     => impact pair exists
--
--   out_of_bounds
--     => no impact pair
--
-- Projection version follows the same boundary.
-- =====================================================

ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD CONSTRAINT
  cing_artillery_shot_resolutions_impact_projection_outcome_check
CHECK (
  (
    outcome IN (
      'player_hit',
      'terrain_hit'
    )

    AND impact_projection_version = 1

    AND impact_x IS NOT NULL
    AND impact_y IS NOT NULL

    AND impact_exact_version = 1
  )
  OR
  (
    outcome = 'out_of_bounds'

    AND impact_projection_version IS NULL

    AND impact_x IS NULL
    AND impact_y IS NULL

    AND impact_exact_version IS NULL
  )
);


COMMENT ON COLUMN
  public.cing_artillery_shot_resolutions.impact_projection_version
IS
  'Compatibility impact projection version. Version 1 projects canonical exact projectile-center impact into solver-space NUMERIC coordinates at 12 decimal places using nearest rounding with exact half ties away from zero. NULL for out_of_bounds.';


COMMENT ON COLUMN
  public.cing_artillery_shot_resolutions.impact_x
IS
  'Projection V1 compatibility X coordinate in solver-space units. Decimal quantum 1e-12; nearest rounding with exact half ties away from zero. Canonical collision authority remains the exact symbolic impact representation. NULL for out_of_bounds.';


COMMENT ON COLUMN
  public.cing_artillery_shot_resolutions.impact_y
IS
  'Projection V1 compatibility Y coordinate in solver-space units. Decimal quantum 1e-12; nearest rounding with exact half ties away from zero. Canonical collision authority remains the exact symbolic impact representation. NULL for out_of_bounds.';


COMMIT;
