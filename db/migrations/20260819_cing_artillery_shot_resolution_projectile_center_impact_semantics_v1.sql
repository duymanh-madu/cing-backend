BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- SHOT RESOLUTION PROJECTILE-CENTER IMPACT SEMANTICS V1
--
-- Purpose:
--
--   align durable shot-resolution impact coordinates with
--   the already-canonical deterministic collision solver.
--
-- Canonical V1 meaning:
--
--   impact_x / impact_y
--
--     = projectile CENTER position at the exact terminal
--       collision parameter on the projectile-center motion
--       segment.
--
-- They are NOT:
--
--   physical surface-contact coordinates
--   owning terrain pixel coordinates
--   clamped map coordinates
--   rendering coordinates
--
-- Why signed coordinates are required:
--
--   Canonical projectile collision uses finite-radius circle
--   geometry.
--
--   A projectile center may legitimately be outside the raw
--   map rectangle while the projectile circle still touches
--   solid edge terrain.
--
--   Therefore valid terrain/player collision terminal center
--   coordinates may be negative near the left/top world edge.
--
-- The original foundation correctly required:
--
--   impact pair nullability
--   finite PostgreSQL NUMERIC coordinates
--
-- but prematurely required:
--
--   impact_x >= 0
--   impact_y >= 0
--
-- which conflicts with the locked solver geometry.
--
-- This migration removes ONLY that incorrect sign restriction.
--
-- It intentionally does NOT:
--
--   choose decimal precision
--   choose numeric rounding
--   choose serialization
--   calculate projectile physics
--   calculate collision
--   calculate damage
--   mutate HP
--   create resolution writer authority
--   alter outcome semantics
--
-- PostgreSQL remains final durable gameplay authority.
-- =====================================================


ALTER TABLE
  public.cing_artillery_shot_resolutions
DROP CONSTRAINT IF EXISTS
  cing_artillery_shot_resolutions_impact_pair_check;


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD CONSTRAINT
  cing_artillery_shot_resolutions_impact_pair_check
CHECK (
  (
    impact_x IS NULL
    AND impact_y IS NULL
  )
  OR
  (
    impact_x IS NOT NULL
    AND impact_y IS NOT NULL

    AND impact_x <> 'NaN'::numeric
    AND impact_x <> 'Infinity'::numeric
    AND impact_x <> '-Infinity'::numeric

    AND impact_y <> 'NaN'::numeric
    AND impact_y <> 'Infinity'::numeric
    AND impact_y <> '-Infinity'::numeric
  )
);


COMMENT ON COLUMN
  public.cing_artillery_shot_resolutions.impact_x
IS
  'Canonical projectile-center terminal X coordinate in continuous solver space. Signed finite NUMERIC; may be negative when a finite-radius projectile collides with geometry at the left/top world edge. NULL only for outcomes whose durable shape has no impact coordinate.';


COMMENT ON COLUMN
  public.cing_artillery_shot_resolutions.impact_y
IS
  'Canonical projectile-center terminal Y coordinate in continuous solver space. Signed finite NUMERIC; may be negative when a finite-radius projectile collides with geometry at the left/top world edge. NULL only for outcomes whose durable shape has no impact coordinate.';


COMMIT;
