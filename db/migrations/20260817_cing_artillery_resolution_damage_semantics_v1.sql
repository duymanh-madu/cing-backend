BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- RESOLUTION DAMAGE SEMANTICS V1
--
-- Purpose:
--
--   make durable shot-resolution shape capable of
--   representing canonical artillery blast damage.
--
-- V1 gameplay semantics:
--
--   player_hit
--     -> impact required
--     -> canonical opponent target required
--     -> damage > 0
--
--   terrain_hit
--     -> impact required
--     -> may produce:
--
--          no affected opponent:
--            target NULL
--            damage = 0
--
--          opponent inside blast radius:
--            target canonical opponent
--            damage > 0
--
--   out_of_bounds
--     -> no impact
--     -> no target
--     -> damage = 0
--
-- Self damage is NOT introduced by this migration.
--
-- Target authority will later be enforced by the fenced
-- Resolution Commit against canonical combat participants.
--
-- This migration intentionally does NOT:
--
--   calculate physics
--   calculate blast distance
--   calculate damage
--   mutate HP
--   complete execution
--   advance turn
--   complete combat
--
-- PostgreSQL remains final durable gameplay authority.
-- =====================================================


-- =====================================================
-- REPLACE THE ORIGINAL OUTCOME SHAPE
--
-- Original foundation intentionally prevented terrain-hit
-- damage until the damage model was defined.
--
-- Physics V1 now defines that model explicitly.
-- =====================================================

ALTER TABLE
  public.cing_artillery_shot_resolutions
DROP CONSTRAINT IF EXISTS
  cing_artillery_shot_resolutions_outcome_shape_check;


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD CONSTRAINT
  cing_artillery_shot_resolutions_outcome_shape_check
CHECK (
  (
    outcome = 'player_hit'

    AND impact_x IS NOT NULL
    AND impact_y IS NOT NULL

    AND target_account_id IS NOT NULL

    AND damage > 0
  )
  OR
  (
    outcome = 'terrain_hit'

    AND impact_x IS NOT NULL
    AND impact_y IS NOT NULL

    AND (
      (
        target_account_id IS NULL
        AND damage = 0
      )
      OR
      (
        target_account_id IS NOT NULL
        AND damage > 0
      )
    )
  )
  OR
  (
    outcome = 'out_of_bounds'

    AND impact_x IS NULL
    AND impact_y IS NULL

    AND target_account_id IS NULL

    AND damage = 0
  )
);


-- =====================================================
-- DEFENSE IN DEPTH
--
-- Resolution damage continues to use PostgreSQL numeric.
-- Existing finite / non-negative constraints remain intact.
--
-- This additional constraint ensures positive damage is
-- never stored without a concrete affected participant.
-- =====================================================

ALTER TABLE
  public.cing_artillery_shot_resolutions
DROP CONSTRAINT IF EXISTS
  cing_artillery_shot_resolutions_damage_target_check;


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD CONSTRAINT
  cing_artillery_shot_resolutions_damage_target_check
CHECK (
  (
    damage = 0
  )
  OR
  (
    damage > 0
    AND target_account_id IS NOT NULL
  )
);


-- =====================================================
-- NO NEW MUTATION AUTHORITY
--
-- service_role retains SELECT-only table authority.
--
-- The future fenced Resolution Commit remains the ONLY
-- intended canonical resolution writer.
-- =====================================================

COMMIT;
