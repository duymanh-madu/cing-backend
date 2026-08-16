BEGIN;

-- =====================================================
-- CING ARTILLERY — COMBAT WORLD AUTHORITY FOUNDATION
--
-- Scope:
--
--   exactly one immutable world snapshot per combat state
--
--   canonical weighted map selection
--   canonical weighted spawn-pair selection
--   canonical A/B player assignment
--   immutable resolved player coordinates
--   immutable initial wind
--
-- Caller supplies ONLY:
--
--   combat_state_id
--
-- Caller cannot supply:
--
--   map
--   spawn
--   player side
--   player coordinates
--   wind
--
-- World initialization is finalized atomically by
-- PostgreSQL.
--
-- Existing initialized worlds remain valid if their map is
-- later disabled. enabled controls NEW world selection only.
--
-- Intentionally NOT defined here:
--
--   projectile trajectory
--   projectile execution
--   terrain destruction
--   damage
--   HP mutation
--   scoring
--   next-turn resolution
--
-- PostgreSQL remains the durable final authority.
-- =====================================================


CREATE TABLE
  public.cing_artillery_combat_world_states (
    id uuid PRIMARY KEY,

    combat_state_id uuid NOT NULL
      REFERENCES public.cing_artillery_combat_states(id)
      ON DELETE RESTRICT,

    match_runtime_id uuid NOT NULL
      REFERENCES public.cing_artillery_match_runtimes(id)
      ON DELETE RESTRICT,

    match_id uuid NOT NULL
      REFERENCES public.cing_artillery_matches(id)
      ON DELETE RESTRICT,

    map_id uuid NOT NULL
      REFERENCES public.cing_artillery_maps(id)
      ON DELETE RESTRICT,

    spawn_pair_id uuid NOT NULL
      REFERENCES public.cing_artillery_map_spawn_pairs(id)
      ON DELETE RESTRICT,

    player_one_side text NOT NULL,

    player_two_side text NOT NULL,

    player_one_x integer NOT NULL,

    player_one_y integer NOT NULL,

    player_two_x integer NOT NULL,

    player_two_y integer NOT NULL,

    initial_wind numeric NOT NULL,

    initialized_at timestamptz NOT NULL,

    created_at timestamptz NOT NULL
      DEFAULT now(),

    CONSTRAINT
      cing_artillery_combat_world_states_player_one_side_check
      CHECK (
        player_one_side IN (
          'a',
          'b'
        )
      ),

    CONSTRAINT
      cing_artillery_combat_world_states_player_two_side_check
      CHECK (
        player_two_side IN (
          'a',
          'b'
        )
      ),

    CONSTRAINT
      cing_artillery_combat_world_states_opposite_sides_check
      CHECK (
        (
          player_one_side = 'a'
          AND player_two_side = 'b'
        )
        OR
        (
          player_one_side = 'b'
          AND player_two_side = 'a'
        )
      ),

    CONSTRAINT
      cing_artillery_combat_world_states_coordinates_check
      CHECK (
        player_one_x >= 0
        AND player_one_y >= 0
        AND player_two_x >= 0
        AND player_two_y >= 0
      ),

    CONSTRAINT
      cing_artillery_combat_world_states_distinct_positions_check
      CHECK (
        player_one_x <>
          player_two_x
        OR player_one_y <>
          player_two_y
      ),

    CONSTRAINT
      cing_artillery_combat_world_states_wind_finite_check
      CHECK (
        initial_wind <>
          'NaN'::numeric
      )
  );


-- Exactly one durable world per canonical combat state.
CREATE UNIQUE INDEX
  cing_artillery_combat_world_states_combat_uidx
ON public.cing_artillery_combat_world_states (
  combat_state_id
);


-- Defensive one-to-one chain with runtime.
CREATE UNIQUE INDEX
  cing_artillery_combat_world_states_runtime_uidx
ON public.cing_artillery_combat_world_states (
  match_runtime_id
);


-- Defensive one-to-one chain with match.
CREATE UNIQUE INDEX
  cing_artillery_combat_world_states_match_uidx
ON public.cing_artillery_combat_world_states (
  match_id
);


CREATE INDEX
  cing_artillery_combat_world_states_map_idx
ON public.cing_artillery_combat_world_states (
  map_id,
  initialized_at DESC
);


CREATE INDEX
  cing_artillery_combat_world_states_spawn_idx
ON public.cing_artillery_combat_world_states (
  spawn_pair_id,
  initialized_at DESC
);


-- =====================================================
-- TABLE ACCESS AUTHORITY
--
-- Durable world writes are RPC-only.
--
-- service_role:
--
--   SELECT only
--
-- No application role receives INSERT / UPDATE / DELETE.
-- =====================================================

ALTER TABLE
  public.cing_artillery_combat_world_states
ENABLE ROW LEVEL SECURITY;


REVOKE ALL
ON TABLE
  public.cing_artillery_combat_world_states
FROM PUBLIC;


REVOKE ALL
ON TABLE
  public.cing_artillery_combat_world_states
FROM anon;


REVOKE ALL
ON TABLE
  public.cing_artillery_combat_world_states
FROM authenticated;


REVOKE ALL
ON TABLE
  public.cing_artillery_combat_world_states
FROM service_role;


GRANT SELECT
ON TABLE
  public.cing_artillery_combat_world_states
TO service_role;


-- =====================================================
-- ATOMIC COMBAT WORLD INITIALIZATION
--
-- Canonical lock order:
--
--   combat state
--       ->
--   selected map
--       ->
--   selected spawn pair
--
-- Multiple Node / Socket.IO instances calling this RPC for
-- one combat serialize on the same combat-state row.
--
-- Random selection occurs only after the canonical combat
-- lock has been acquired and is persisted exactly once.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_get_or_create_combat_world_atomic(
    p_combat_state_id uuid
  )
RETURNS public.cing_artillery_combat_world_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_config jsonb;

  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_world
    public.cing_artillery_combat_world_states%ROWTYPE;

  v_map
    public.cing_artillery_maps%ROWTYPE;

  v_spawn
    public.cing_artillery_map_spawn_pairs%ROWTYPE;

  v_selected_map_id uuid;
  v_selected_spawn_id uuid;

  v_wind_min numeric;
  v_wind_max numeric;
  v_initial_wind numeric;

  v_player_one_side text;
  v_player_two_side text;

  v_player_one_x integer;
  v_player_one_y integer;
  v_player_two_x integer;
  v_player_two_y integer;

  v_initialized_at timestamptz;

  /*
   * Canonical server-side entropy.
   *
   * Initiative authority already uses gen_random_uuid()
   * for cryptographically strong PostgreSQL randomness.
   *
   * Combat-world initialization follows the same policy.
   *
   * v_random_u32 is reconstructed from four independent
   * UUID bytes and therefore lies in:
   *
   *   0 .. 4294967295
   *
   * v_random_fraction therefore lies in:
   *
   *   [0, 1)
   */
  v_entropy uuid;
  v_random_u32 bigint;
  v_random_fraction numeric;
BEGIN
  IF p_combat_state_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_ID_REQUIRED';
  END IF;


  -- ===================================================
  -- GAMEPLAY FEATURE GATE
  --
  -- This is a new gameplay-world initialization boundary,
  -- therefore it cannot create new world state while the
  -- game is dark.
  -- ===================================================

  SELECT
    cing_artillery_config
  INTO
    v_config
  FROM public.app_configs
  WHERE id = 1;

  IF NOT FOUND
     OR v_config IS NULL
     OR jsonb_typeof(
          v_config
        ) <> 'object'
     OR jsonb_typeof(
          v_config -> 'enabled'
        ) <> 'boolean'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_config_invalid';
  END IF;

  IF NOT (
    v_config ->> 'enabled'
  )::boolean
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_disabled';
  END IF;


  -- ===================================================
  -- CANONICAL COMBAT LOCK
  -- ===================================================

  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.id =
    p_combat_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_FOUND';
  END IF;

  IF v_combat.status <>
       'initialized'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_WORLD_ELIGIBLE';
  END IF;


  -- ===================================================
  -- IMMUTABLE WIND RULE AUTHORITY
  --
  -- Never read current global wind rules here.
  -- Existing combat rules_snapshot is the per-match source
  -- of truth.
  -- ===================================================

  IF v_combat.rules_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.rules_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.rules_snapshot ->
            'wind_min'
        ) <> 'number'
     OR jsonb_typeof(
          v_combat.rules_snapshot ->
            'wind_max'
        ) <> 'number'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_WORLD_RULES_INVALID';
  END IF;

  v_wind_min :=
    (
      v_combat.rules_snapshot ->>
        'wind_min'
    )::numeric;

  v_wind_max :=
    (
      v_combat.rules_snapshot ->>
        'wind_max'
    )::numeric;

  IF v_wind_min =
       'NaN'::numeric
     OR v_wind_max =
       'NaN'::numeric
     OR v_wind_min >
       v_wind_max
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_WORLD_RULES_INVALID';
  END IF;


  -- ===================================================
  -- IDEMPOTENT CANONICAL RE-ENTRY
  --
  -- enabled state is intentionally NOT checked here.
  --
  -- A map may be disabled after this world was initialized.
  -- Existing world snapshots must remain valid.
  -- ===================================================

  SELECT w.*
  INTO v_world
  FROM public.cing_artillery_combat_world_states AS w
  WHERE w.combat_state_id =
    v_combat.id;

  IF FOUND THEN
    IF v_world.match_runtime_id <>
         v_combat.match_runtime_id
       OR v_world.match_id <>
         v_combat.match_id
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_INCONSISTENT';
    END IF;


    SELECT m.*
    INTO v_map
    FROM public.cing_artillery_maps AS m
    WHERE m.id =
      v_world.map_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_MAP_MISSING';
    END IF;


    SELECT s.*
    INTO v_spawn
    FROM public.cing_artillery_map_spawn_pairs AS s
    WHERE s.id =
      v_world.spawn_pair_id;

    IF NOT FOUND
       OR v_spawn.map_id <>
          v_map.id
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_SPAWN_INCONSISTENT';
    END IF;


    -- Map content identity remains canonical even after the
    -- map is no longer selectable for new worlds.
    IF v_map.collision_format <>
         'bitmask_v1'
       OR NOT
         public.cing_artillery_validate_collision_bitmask_v1(
           v_map.width_px,
           v_map.height_px,
           v_map.collision_mask
         )
       OR v_map.collision_mask_sha256 !~
         '^[0-9a-f]{64}$'
       OR v_map.collision_mask_sha256 <>
         encode(
           extensions.digest(
             v_map.collision_mask,
             'sha256'
           ),
           'hex'
         )
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_MAP_INCONSISTENT';
    END IF;


    IF NOT
      public.cing_artillery_validate_map_spawn_surface_v1(
        v_map.width_px,
        v_map.height_px,
        v_map.collision_mask,
        v_spawn.side_a_x,
        v_spawn.side_a_y
      )
      OR NOT
      public.cing_artillery_validate_map_spawn_surface_v1(
        v_map.width_px,
        v_map.height_px,
        v_map.collision_mask,
        v_spawn.side_b_x,
        v_spawn.side_b_y
      )
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_SPAWN_INCONSISTENT';
    END IF;


    IF (
         v_world.player_one_side = 'a'
         AND (
           v_world.player_two_side <> 'b'
           OR v_world.player_one_x <>
              v_spawn.side_a_x
           OR v_world.player_one_y <>
              v_spawn.side_a_y
           OR v_world.player_two_x <>
              v_spawn.side_b_x
           OR v_world.player_two_y <>
              v_spawn.side_b_y
         )
       )
       OR
       (
         v_world.player_one_side = 'b'
         AND (
           v_world.player_two_side <> 'a'
           OR v_world.player_one_x <>
              v_spawn.side_b_x
           OR v_world.player_one_y <>
              v_spawn.side_b_y
           OR v_world.player_two_x <>
              v_spawn.side_a_x
           OR v_world.player_two_y <>
              v_spawn.side_a_y
         )
       )
       OR v_world.initial_wind =
          'NaN'::numeric
       OR v_world.initial_wind <
          v_wind_min
       OR v_world.initial_wind >
          v_wind_max
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_INCONSISTENT';
    END IF;

    RETURN v_world;
  END IF;


  -- ===================================================
  -- WEIGHTED MAP SELECTION
  --
  -- selection_weight is immutable map-catalog authority.
  --
  -- The candidate query observes one PostgreSQL statement
  -- snapshot. The chosen row is then locked and enabled is
  -- rechecked after lock acquisition.
  --
  -- A concurrent disable can therefore never commit a NEW
  -- world using a disabled map.
  -- ===================================================

  LOOP
    v_selected_map_id :=
      NULL;

    v_entropy :=
      gen_random_uuid();

    v_random_u32 :=
        get_byte(
          uuid_send(v_entropy),
          0
        )::bigint
        * 16777216
      +
        get_byte(
          uuid_send(v_entropy),
          1
        )::bigint
        * 65536
      +
        get_byte(
          uuid_send(v_entropy),
          2
        )::bigint
        * 256
      +
        get_byte(
          uuid_send(v_entropy),
          3
        )::bigint;

    v_random_fraction :=
      v_random_u32::numeric
      /
      4294967296::numeric;

    WITH eligible AS MATERIALIZED (
      SELECT
        m.id,

        sum(
          m.selection_weight::bigint
        ) OVER (
          ORDER BY m.id
          ROWS BETWEEN
            UNBOUNDED PRECEDING
            AND CURRENT ROW
        ) AS cumulative_weight,

        sum(
          m.selection_weight::bigint
        ) OVER () AS total_weight

      FROM public.cing_artillery_maps AS m

      WHERE m.enabled = true
    ),

    ticket AS MATERIALIZED (
      SELECT
        floor(
          v_random_fraction
          *
          max(
            e.total_weight
          )::numeric
        )::bigint
        + 1 AS value

      FROM eligible AS e
    )

    SELECT e.id
    INTO v_selected_map_id
    FROM eligible AS e
    CROSS JOIN ticket AS t
    WHERE e.cumulative_weight >=
      t.value
    ORDER BY
      e.cumulative_weight,
      e.id
    LIMIT 1;


    IF v_selected_map_id IS NULL THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_NO_ENABLED_MAP';
    END IF;


    SELECT m.*
    INTO v_map
    FROM public.cing_artillery_maps AS m
    WHERE m.id =
      v_selected_map_id
      AND m.enabled = true
    FOR UPDATE;

    IF FOUND THEN
      EXIT;
    END IF;

    -- The selected candidate was concurrently disabled.
    -- Re-select from the latest committed eligible set.
  END LOOP;


  -- Revalidate map eligibility after canonical row lock.
  IF v_map.collision_format <>
       'bitmask_v1'
     OR NOT
       public.cing_artillery_validate_collision_bitmask_v1(
         v_map.width_px,
         v_map.height_px,
         v_map.collision_mask
       )
     OR v_map.collision_mask_sha256 !~
       '^[0-9a-f]{64}$'
     OR v_map.collision_mask_sha256 <>
       encode(
         extensions.digest(
           v_map.collision_mask,
           'sha256'
         ),
         'hex'
       )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_WORLD_MAP_INVALID';
  END IF;


  -- ===================================================
  -- WEIGHTED SPAWN SELECTION
  --
  -- Map row remains locked while the spawn is selected.
  --
  -- This preserves canonical map -> spawn lock ordering and
  -- is compatible with later spawn lifecycle authority.
  -- ===================================================

  LOOP
    v_selected_spawn_id :=
      NULL;

    v_entropy :=
      gen_random_uuid();

    v_random_u32 :=
        get_byte(
          uuid_send(v_entropy),
          0
        )::bigint
        * 16777216
      +
        get_byte(
          uuid_send(v_entropy),
          1
        )::bigint
        * 65536
      +
        get_byte(
          uuid_send(v_entropy),
          2
        )::bigint
        * 256
      +
        get_byte(
          uuid_send(v_entropy),
          3
        )::bigint;

    v_random_fraction :=
      v_random_u32::numeric
      /
      4294967296::numeric;

    WITH eligible AS MATERIALIZED (
      SELECT
        s.id,

        sum(
          s.selection_weight::bigint
        ) OVER (
          ORDER BY s.id
          ROWS BETWEEN
            UNBOUNDED PRECEDING
            AND CURRENT ROW
        ) AS cumulative_weight,

        sum(
          s.selection_weight::bigint
        ) OVER () AS total_weight

      FROM public.cing_artillery_map_spawn_pairs AS s

      WHERE s.map_id =
        v_map.id
        AND s.enabled = true
    ),

    ticket AS MATERIALIZED (
      SELECT
        floor(
          v_random_fraction
          *
          max(
            e.total_weight
          )::numeric
        )::bigint
        + 1 AS value

      FROM eligible AS e
    )

    SELECT e.id
    INTO v_selected_spawn_id
    FROM eligible AS e
    CROSS JOIN ticket AS t
    WHERE e.cumulative_weight >=
      t.value
    ORDER BY
      e.cumulative_weight,
      e.id
    LIMIT 1;


    IF v_selected_spawn_id IS NULL THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_NO_ENABLED_SPAWN';
    END IF;


    SELECT s.*
    INTO v_spawn
    FROM public.cing_artillery_map_spawn_pairs AS s
    WHERE s.id =
      v_selected_spawn_id
      AND s.map_id =
        v_map.id
      AND s.enabled = true
    FOR UPDATE;

    IF FOUND THEN
      EXIT;
    END IF;

    -- Defensive retry for future concurrent spawn lifecycle.
  END LOOP;


  IF NOT
    public.cing_artillery_validate_map_spawn_surface_v1(
      v_map.width_px,
      v_map.height_px,
      v_map.collision_mask,
      v_spawn.side_a_x,
      v_spawn.side_a_y
    )
    OR NOT
    public.cing_artillery_validate_map_spawn_surface_v1(
      v_map.width_px,
      v_map.height_px,
      v_map.collision_mask,
      v_spawn.side_b_x,
      v_spawn.side_b_y
    )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_WORLD_SPAWN_INVALID';
  END IF;


  -- ===================================================
  -- SERVER-SIDE A/B ASSIGNMENT
  --
  -- Matchmaking order does not grant tactical side
  -- ownership.
  --
  -- The random decision is made only after the combat,
  -- map and spawn authorities are locked and is persisted
  -- exactly once.
  -- ===================================================

  v_entropy :=
    gen_random_uuid();

  IF (
    get_byte(
      uuid_send(v_entropy),
      0
    ) % 2
  ) = 0 THEN
    v_player_one_side :=
      'a';

    v_player_two_side :=
      'b';

    v_player_one_x :=
      v_spawn.side_a_x;

    v_player_one_y :=
      v_spawn.side_a_y;

    v_player_two_x :=
      v_spawn.side_b_x;

    v_player_two_y :=
      v_spawn.side_b_y;
  ELSE
    v_player_one_side :=
      'b';

    v_player_two_side :=
      'a';

    v_player_one_x :=
      v_spawn.side_b_x;

    v_player_one_y :=
      v_spawn.side_b_y;

    v_player_two_x :=
      v_spawn.side_a_x;

    v_player_two_y :=
      v_spawn.side_a_y;
  END IF;


  -- ===================================================
  -- INITIAL WIND
  --
  -- Wind is generated from the immutable combat rules
  -- snapshot and then persisted.
  --
  -- No current/global config values participate here.
  -- ===================================================

  IF v_wind_min =
       v_wind_max
  THEN
    v_initial_wind :=
      v_wind_min;
  ELSE
    v_entropy :=
      gen_random_uuid();

    v_random_u32 :=
        get_byte(
          uuid_send(v_entropy),
          0
        )::bigint
        * 16777216
      +
        get_byte(
          uuid_send(v_entropy),
          1
        )::bigint
        * 65536
      +
        get_byte(
          uuid_send(v_entropy),
          2
        )::bigint
        * 256
      +
        get_byte(
          uuid_send(v_entropy),
          3
        )::bigint;

    v_random_fraction :=
      v_random_u32::numeric
      /
      4294967296::numeric;

    v_initial_wind :=
      v_wind_min
      +
      (
        (
          v_wind_max -
          v_wind_min
        )
        *
        v_random_fraction
      );
  END IF;

  IF v_initial_wind =
       'NaN'::numeric
     OR v_initial_wind <
       v_wind_min
     OR v_initial_wind >
       v_wind_max
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_WORLD_WIND_INVALID';
  END IF;


  -- ===================================================
  -- DURABLE WORLD SNAPSHOT
  -- ===================================================

  v_initialized_at :=
    clock_timestamp();

  INSERT INTO
    public.cing_artillery_combat_world_states (
      id,
      combat_state_id,
      match_runtime_id,
      match_id,
      map_id,
      spawn_pair_id,
      player_one_side,
      player_two_side,
      player_one_x,
      player_one_y,
      player_two_x,
      player_two_y,
      initial_wind,
      initialized_at
    )
  VALUES (
    gen_random_uuid(),
    v_combat.id,
    v_combat.match_runtime_id,
    v_combat.match_id,
    v_map.id,
    v_spawn.id,
    v_player_one_side,
    v_player_two_side,
    v_player_one_x,
    v_player_one_y,
    v_player_two_x,
    v_player_two_y,
    v_initial_wind,
    v_initialized_at
  )
  RETURNING *
  INTO v_world;


  -- ===================================================
  -- PERSISTENCE POSTCONDITION
  -- ===================================================

  IF v_world.id IS NULL
     OR v_world.combat_state_id <>
        v_combat.id
     OR v_world.match_runtime_id <>
        v_combat.match_runtime_id
     OR v_world.match_id <>
        v_combat.match_id
     OR v_world.map_id <>
        v_map.id
     OR v_world.spawn_pair_id <>
        v_spawn.id
     OR v_world.player_one_side <>
        v_player_one_side
     OR v_world.player_two_side <>
        v_player_two_side
     OR v_world.player_one_x <>
        v_player_one_x
     OR v_world.player_one_y <>
        v_player_one_y
     OR v_world.player_two_x <>
        v_player_two_x
     OR v_world.player_two_y <>
        v_player_two_y
     OR v_world.initial_wind <>
        v_initial_wind
     OR v_world.initialized_at <>
        v_initialized_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_WORLD_PERSISTENCE_INCONSISTENT';
  END IF;

  RETURN v_world;
END;
$$;


-- =====================================================
-- PRIVATE SERVER-SIDE RPC
-- =====================================================

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_combat_world_atomic(
    uuid
  )
FROM PUBLIC;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_combat_world_atomic(
    uuid
  )
FROM anon;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_combat_world_atomic(
    uuid
  )
FROM authenticated;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_combat_world_atomic(
    uuid
  )
FROM service_role;


GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_get_or_create_combat_world_atomic(
    uuid
  )
TO service_role;


COMMIT;
