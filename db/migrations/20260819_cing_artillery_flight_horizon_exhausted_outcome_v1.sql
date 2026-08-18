BEGIN;

-- CING PIU PIU / CING ARTILLERY
-- FLIGHT HORIZON EXHAUSTED OUTCOME V1
--
-- Canonical meaning:
--
--   the deterministic fixed-step trajectory reached exactly
--   max_flight_time_ms without any earlier:
--
--     player collision
--     terrain collision
--     projectile world exit
--
-- This outcome is NOT:
--
--   out_of_bounds
--   wall-clock timeout
--   network timeout
--   execution lease timeout
--   physics failure
--
-- max_flight_time_ms is a deterministic computational
-- trajectory horizon.
--
-- Durable shape:
--
--   outcome = flight_horizon_exhausted
--   impact_x / impact_y = NULL
--   exact impact authority = NULL
--   numeric projection version = NULL
--   target_account_id = NULL
--   damage = 0
--
-- This migration changes schema contract only.
--
-- It does NOT:
--
--   implement the solver loop
--   calculate trajectory
--   mutate existing rows
--   create writer authority
--   advance turn
--   mutate HP
--   complete execution
--   emit realtime events


ALTER TABLE
  public.cing_artillery_shot_resolutions
DROP CONSTRAINT IF EXISTS
  cing_artillery_shot_resolutions_outcome_check;


ALTER TABLE
  public.cing_artillery_shot_resolutions
ADD CONSTRAINT
  cing_artillery_shot_resolutions_outcome_check
CHECK (
  outcome IN (
    'terrain_hit',
    'player_hit',
    'out_of_bounds',
    'flight_horizon_exhausted'
  )
);


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
  OR
  (
    outcome = 'flight_horizon_exhausted'

    AND impact_x IS NULL
    AND impact_y IS NULL

    AND target_account_id IS NULL

    AND damage = 0
  )
);


ALTER TABLE
  public.cing_artillery_shot_resolutions
DROP CONSTRAINT IF EXISTS
  cing_artillery_shot_resolutions_impact_exact_outcome_check;


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
    outcome IN (
      'out_of_bounds',
      'flight_horizon_exhausted'
    )

    AND impact_exact_version IS NULL
  )
);


ALTER TABLE
  public.cing_artillery_shot_resolutions
DROP CONSTRAINT IF EXISTS
  cing_artillery_shot_resolutions_impact_projection_outcome_check;


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
    outcome IN (
      'out_of_bounds',
      'flight_horizon_exhausted'
    )

    AND impact_projection_version IS NULL

    AND impact_x IS NULL
    AND impact_y IS NULL

    AND impact_exact_version IS NULL
  )
);


COMMENT ON COLUMN
  public.cing_artillery_shot_resolutions.outcome
IS
  'Canonical deterministic terminal shot outcome: player_hit, terrain_hit, out_of_bounds, or flight_horizon_exhausted. flight_horizon_exhausted means the canonical fixed-step trajectory reached max_flight_time_ms without an earlier collision or geometric world exit; it is not out_of_bounds or a wall-clock timeout.';


COMMIT;
