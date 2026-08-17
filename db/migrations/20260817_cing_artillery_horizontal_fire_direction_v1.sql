BEGIN;

-- =====================================================
-- CING ARTILLERY — HORIZONTAL FIRE DIRECTION V1
--
-- Physics V1 derives horizontal firing direction ONLY
-- from the immutable participant X coordinates:
--
--   opponent_x > shooter_x  => right (+X)
--   opponent_x < shooter_x  => left  (-X)
--
-- Side labels "a" / "b" are deliberately NOT direction.
-- Combat-world authority assigns A/B randomly.
--
-- Therefore equal participant X coordinates are invalid
-- for Physics V1 because they would make horizontal firing
-- direction undefined.
--
-- Source-only migration.
-- No trajectory, trig, damage or gameplay mutation.
-- =====================================================


ALTER TABLE
  public.cing_artillery_map_spawn_pairs
ADD CONSTRAINT
  cing_artillery_map_spawn_pairs_distinct_horizontal_positions_check
CHECK (
  side_a_x <> side_b_x
);


-- Defense in depth for the immutable resolved world
-- snapshot. World coordinates are derived from the selected
-- spawn pair, but the durable world must independently retain
-- the same Physics V1 invariant.
ALTER TABLE
  public.cing_artillery_combat_world_states
ADD CONSTRAINT
  cing_artillery_combat_world_states_distinct_horizontal_positions_check
CHECK (
  player_one_x <>
    player_two_x
);


COMMENT ON CONSTRAINT
  cing_artillery_map_spawn_pairs_distinct_horizontal_positions_check
ON public.cing_artillery_map_spawn_pairs
IS
  'Physics V1 requires side A/B spawn X coordinates to differ. A/B labels do not imply direction; fire direction derives from opponent X relative to shooter X.';


COMMENT ON CONSTRAINT
  cing_artillery_combat_world_states_distinct_horizontal_positions_check
ON public.cing_artillery_combat_world_states
IS
  'Physics V1 requires participant X coordinates to differ so horizontal fire direction is always deterministically derivable.';


COMMIT;
