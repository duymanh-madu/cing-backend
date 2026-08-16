BEGIN;

-- =====================================================
-- CING ARTILLERY — SHOT RESOLUTION DURABLE FOUNDATION
--
-- One accepted shot command owns exactly one durable
-- execution, and one execution may own at most one
-- immutable canonical resolution.
--
-- This foundation stores deterministic solver OUTPUT only.
--
-- It does NOT:
--
--   calculate projectile physics
--   inspect collision geometry
--   mutate HP
--   mutate turn state
--   complete a match
--   complete an execution
--
-- The later fenced resolution-commit authority will own
-- those atomic gameplay lifecycle transitions.
-- =====================================================

CREATE TABLE
  public.cing_artillery_shot_resolutions (
    id uuid PRIMARY KEY,

    execution_id uuid NOT NULL
      REFERENCES
        public.cing_artillery_shot_executions(id)
      ON DELETE RESTRICT,

    shot_command_id uuid NOT NULL
      REFERENCES
        public.cing_artillery_shot_commands(id)
      ON DELETE RESTRICT,

    combat_state_id uuid NOT NULL
      REFERENCES
        public.cing_artillery_combat_states(id)
      ON DELETE RESTRICT,

    combat_world_state_id uuid NOT NULL
      REFERENCES
        public.cing_artillery_combat_world_states(id)
      ON DELETE RESTRICT,

    turn_state_id uuid NOT NULL
      REFERENCES
        public.cing_artillery_turn_states(id)
      ON DELETE RESTRICT,

    match_runtime_id uuid NOT NULL
      REFERENCES
        public.cing_artillery_match_runtimes(id)
      ON DELETE RESTRICT,

    match_id uuid NOT NULL
      REFERENCES
        public.cing_artillery_matches(id)
      ON DELETE RESTRICT,

    turn_number integer NOT NULL,

    /*
     * Explicit deterministic solver identity.
     *
     * A physics implementation upgrade must advance this
     * version instead of silently changing the meaning of
     * an already accepted execution.
     */
    physics_version integer NOT NULL,

    /*
     * Canonical terminal classification only.
     *
     * No client/rendering representation belongs here.
     */
    outcome text NOT NULL,

    /*
     * Continuous solver-space terminal coordinates.
     *
     * They intentionally remain numeric rather than integer.
     * Collision authority may later resolve against discrete
     * map pixels without destroying solver precision here.
     */
    impact_x numeric,

    impact_y numeric,

    target_account_id uuid
      REFERENCES
        public.cing_artillery_accounts(id)
      ON DELETE RESTRICT,

    /*
     * Damage remains numeric because canonical game rules
     * and max_hp are numeric authorities. The foundation
     * must not prematurely impose integer damage semantics.
     */
    damage numeric NOT NULL
      DEFAULT 0,

    resolved_at timestamptz NOT NULL
      DEFAULT now(),

    created_at timestamptz NOT NULL
      DEFAULT now(),

    CONSTRAINT
      cing_artillery_shot_resolutions_execution_uidx
      UNIQUE (
        execution_id
      ),

    CONSTRAINT
      cing_artillery_shot_resolutions_command_uidx
      UNIQUE (
        shot_command_id
      ),

    CONSTRAINT
      cing_artillery_shot_resolutions_combat_turn_uidx
      UNIQUE (
        combat_state_id,
        turn_number
      ),

    CONSTRAINT
      cing_artillery_shot_resolutions_turn_number_check
      CHECK (
        turn_number > 0
      ),

    CONSTRAINT
      cing_artillery_shot_resolutions_physics_version_check
      CHECK (
        physics_version > 0
      ),

    CONSTRAINT
      cing_artillery_shot_resolutions_outcome_check
      CHECK (
        outcome IN (
          'terrain_hit',
          'player_hit',
          'out_of_bounds'
        )
      ),

    /*
     * PostgreSQL numeric supports NaN and infinities.
     * Canonical deterministic outputs must be finite.
     */
    CONSTRAINT
      cing_artillery_shot_resolutions_damage_finite_check
      CHECK (
        damage <> 'NaN'::numeric
        AND damage <> 'Infinity'::numeric
        AND damage <> '-Infinity'::numeric
        AND damage >= 0
      ),

    CONSTRAINT
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

          AND impact_x >= 0
          AND impact_y >= 0
        )
      ),

    /*
     * Do not encode future damage formulas here.
     *
     * A legitimate player collision may resolve to zero
     * damage depending on the later canonical formula.
     */
    CONSTRAINT
      cing_artillery_shot_resolutions_outcome_shape_check
      CHECK (
        (
          outcome = 'player_hit'

          AND impact_x IS NOT NULL
          AND impact_y IS NOT NULL

          AND target_account_id IS NOT NULL
        )
        OR
        (
          outcome = 'terrain_hit'

          AND impact_x IS NOT NULL
          AND impact_y IS NOT NULL

          AND target_account_id IS NULL

          AND damage = 0
        )
        OR
        (
          outcome = 'out_of_bounds'

          AND impact_x IS NULL
          AND impact_y IS NULL

          AND target_account_id IS NULL

          AND damage = 0
        )
      )
  );


-- =====================================================
-- QUERY SUPPORT
-- =====================================================

CREATE INDEX
  cing_artillery_shot_resolutions_match_turn_idx
ON public.cing_artillery_shot_resolutions (
  match_id,
  turn_number
);

CREATE INDEX
  cing_artillery_shot_resolutions_runtime_turn_idx
ON public.cing_artillery_shot_resolutions (
  match_runtime_id,
  turn_number
);


-- =====================================================
-- APPLICATION SECURITY
--
-- service_role may inspect canonical results.
-- It may NOT directly INSERT / UPDATE / DELETE them.
--
-- Future mutation authority must be a hardened,
-- fenced SECURITY DEFINER RPC.
-- =====================================================

ALTER TABLE
  public.cing_artillery_shot_resolutions
ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE
  public.cing_artillery_shot_resolutions
FROM PUBLIC;

REVOKE ALL
ON TABLE
  public.cing_artillery_shot_resolutions
FROM anon;

REVOKE ALL
ON TABLE
  public.cing_artillery_shot_resolutions
FROM authenticated;

REVOKE ALL
ON TABLE
  public.cing_artillery_shot_resolutions
FROM service_role;

GRANT SELECT
ON TABLE
  public.cing_artillery_shot_resolutions
TO service_role;


-- =====================================================
-- IMPORTANT NEXT AUTHORITY
--
-- No application RPC is intentionally created here.
--
-- The next migration must atomically validate:
--
--   execution_id
--   live processing execution
--   exact claim_token fencing
--   unexpired lease
--   shot_command identity
--   combat identity
--   immutable combat world identity
--   turn identity / turn_number
--   physics_version
--   participant target authority
--
-- before any canonical resolution may become durable.
--
-- Resolution persistence, gameplay mutation and execution
-- completion must never be independently committable.
-- =====================================================

COMMIT;
