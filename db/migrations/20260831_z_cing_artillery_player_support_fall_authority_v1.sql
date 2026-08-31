BEGIN;

-- =====================================================
-- CING PIU PIU — PLAYER SUPPORT / FALL AUTHORITY V1
--
-- Runtime terrain:
--   immutable published map collision mask
--       -> per-combat mutable terrain snapshot
--
-- Player:
--   mutable ground-contact position
--       -> support footprint
--       -> stable OR deterministic vertical fall
--       -> landing OR fell_out_of_world
--
-- Projectile out_of_bounds remains unrelated.
-- =====================================================


CREATE TABLE
  public.cing_artillery_combat_terrain_states (
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

    width_px integer NOT NULL,

    height_px integer NOT NULL,

    collision_mask bytea NOT NULL,

    terrain_revision bigint NOT NULL
      DEFAULT 0,

    initialized_at timestamptz NOT NULL,

    updated_at timestamptz NOT NULL,

    CONSTRAINT
      cing_artillery_combat_terrain_dimensions_check
      CHECK (
        width_px > 0
        AND height_px > 0
      ),

    CONSTRAINT
      cing_artillery_combat_terrain_revision_check
      CHECK (
        terrain_revision >= 0
      ),

    CONSTRAINT
      cing_artillery_combat_terrain_mask_check
      CHECK (
        public.cing_artillery_validate_collision_bitmask_v1(
          width_px,
          height_px,
          collision_mask
        )
      ),

    CONSTRAINT
      cing_artillery_combat_terrain_timestamp_check
      CHECK (
        updated_at >= initialized_at
      )
  );


CREATE UNIQUE INDEX
  cing_artillery_combat_terrain_states_combat_uidx
ON public.cing_artillery_combat_terrain_states (
  combat_state_id
);


CREATE UNIQUE INDEX
  cing_artillery_combat_terrain_states_runtime_uidx
ON public.cing_artillery_combat_terrain_states (
  match_runtime_id
);


CREATE UNIQUE INDEX
  cing_artillery_combat_terrain_states_match_uidx
ON public.cing_artillery_combat_terrain_states (
  match_id
);


ALTER TABLE
  public.cing_artillery_combat_terrain_states
ENABLE ROW LEVEL SECURITY;


REVOKE ALL
ON TABLE
  public.cing_artillery_combat_terrain_states
FROM PUBLIC;

REVOKE ALL
ON TABLE
  public.cing_artillery_combat_terrain_states
FROM anon;

REVOKE ALL
ON TABLE
  public.cing_artillery_combat_terrain_states
FROM authenticated;

REVOKE ALL
ON TABLE
  public.cing_artillery_combat_terrain_states
FROM service_role;


-- =====================================================
-- MUTABLE TERRAIN INITIALIZATION
--
-- Initial bytes are copied exactly from immutable map content.
-- Future crater authority mutates only this per-combat snapshot.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_get_or_create_combat_terrain_private(
    p_combat_state_id uuid
  )
RETURNS public.cing_artillery_combat_terrain_states
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_world
    public.cing_artillery_combat_world_states%ROWTYPE;

  v_map
    public.cing_artillery_maps%ROWTYPE;

  v_terrain
    public.cing_artillery_combat_terrain_states%ROWTYPE;

  v_now timestamptz;
BEGIN
  IF p_combat_state_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_ID_REQUIRED';
  END IF;


  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.id = p_combat_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_FOUND';
  END IF;

  IF v_combat.status <> 'initialized' THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TERRAIN_COMBAT_NOT_ACTIVE';
  END IF;


  SELECT t.*
  INTO v_terrain
  FROM public.cing_artillery_combat_terrain_states AS t
  WHERE t.combat_state_id = v_combat.id;

  IF FOUND THEN
    RETURN v_terrain;
  END IF;


  SELECT w.*
  INTO v_world
  FROM public.cing_artillery_combat_world_states AS w
  WHERE w.combat_state_id = v_combat.id;

  IF NOT FOUND
     OR v_world.match_runtime_id <>
        v_combat.match_runtime_id
     OR v_world.match_id <>
        v_combat.match_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TERRAIN_WORLD_INVALID';
  END IF;


  SELECT m.*
  INTO v_map
  FROM public.cing_artillery_maps AS m
  WHERE m.id = v_world.map_id;

  IF NOT FOUND
     OR v_map.collision_format <> 'bitmask_v1'
     OR NOT
       public.cing_artillery_validate_collision_bitmask_v1(
         v_map.width_px,
         v_map.height_px,
         v_map.collision_mask
       )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TERRAIN_MAP_INVALID';
  END IF;


  v_now := clock_timestamp();


  INSERT INTO
    public.cing_artillery_combat_terrain_states (
      id,
      combat_state_id,
      match_runtime_id,
      match_id,
      map_id,
      width_px,
      height_px,
      collision_mask,
      terrain_revision,
      initialized_at,
      updated_at
    )
  VALUES (
    gen_random_uuid(),
    v_combat.id,
    v_combat.match_runtime_id,
    v_combat.match_id,
    v_map.id,
    v_map.width_px,
    v_map.height_px,
    v_map.collision_mask,
    0,
    v_now,
    v_now
  )
  RETURNING *
  INTO v_terrain;


  RETURN v_terrain;
END;
$$;


-- =====================================================
-- CANONICAL BITMASK MEMBERSHIP
--
-- MSB-first bit ordering matches published bitmask_v1.
-- Out-of-world coordinates are never solid.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_terrain_pixel_solid_private_v1(
    p_width_px integer,
    p_height_px integer,
    p_collision_mask bytea,
    p_x integer,
    p_y integer
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row_bytes integer;
  v_byte_index integer;
  v_bit_offset integer;
  v_mask integer;
BEGIN
  IF p_width_px <= 0
     OR p_height_px <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_TERRAIN_DIMENSIONS_INVALID';
  END IF;

  IF p_x < 0
     OR p_y < 0
     OR p_x >= p_width_px
     OR p_y >= p_height_px
  THEN
    RETURN false;
  END IF;

  v_row_bytes :=
    (p_width_px + 7) / 8;

  v_byte_index :=
    (p_y * v_row_bytes)
    +
    (p_x / 8);

  v_bit_offset :=
    p_x % 8;

  v_mask :=
    128 >> v_bit_offset;

  RETURN (
    get_byte(
      p_collision_mask,
      v_byte_index
    ) & v_mask
  ) <> 0;
END;
$$;


-- =====================================================
-- SUPPORT FOOTPRINT
--
-- position_x/y are canonical ground-contact coordinates.
--
-- Projectile hit-circle is NOT reused as a foot collider.
--
-- Instead support width is deterministically derived from the
-- already-snapshotted player hit radius:
--
--   center
--   center - floor(radius / 2)
--   center + floor(radius / 2)
--
-- Any supported sample keeps the player standing.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_player_supported_private_v1(
    p_width_px integer,
    p_height_px integer,
    p_collision_mask bytea,
    p_position_x integer,
    p_position_y integer,
    p_player_hit_radius_px numeric
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_half_width integer;
BEGIN
  IF p_player_hit_radius_px <= 0
     OR p_player_hit_radius_px =
        'NaN'::numeric
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_SUPPORT_RADIUS_INVALID';
  END IF;

  v_half_width :=
    greatest(
      1,
      floor(
        p_player_hit_radius_px / 2
      )::integer
    );

  RETURN
    public.cing_artillery_terrain_pixel_solid_private_v1(
      p_width_px,
      p_height_px,
      p_collision_mask,
      p_position_x,
      p_position_y
    )
    OR
    public.cing_artillery_terrain_pixel_solid_private_v1(
      p_width_px,
      p_height_px,
      p_collision_mask,
      p_position_x - v_half_width,
      p_position_y
    )
    OR
    public.cing_artillery_terrain_pixel_solid_private_v1(
      p_width_px,
      p_height_px,
      p_collision_mask,
      p_position_x + v_half_width,
      p_position_y
    );
END;
$$;


-- =====================================================
-- SUPPORT / FALL RESOLUTION
--
-- This is deterministic settlement authority, not frame
-- animation authority.
--
-- If support disappears:
--
--   scan downward one canonical pixel at a time
--   first supported Y => deterministic landing
--   no supported Y before map bottom => fell_out_of_world
--
-- Client may animate the projected fall distance, but cannot
-- choose the landing or terminal outcome.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_resolve_player_support_private_v1(
    p_combat_state_id uuid,
    p_turn_state_id uuid,
    p_expected_turn_number integer,
    p_account_id uuid
  )
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_terrain
    public.cing_artillery_combat_terrain_states%ROWTYPE;

  v_player
    public.cing_artillery_player_world_states%ROWTYPE;

  v_hit_radius numeric;

  v_scan_y integer;

  v_landing_y integer;

  v_supported boolean;

  v_now timestamptz;

  v_start_y integer;
BEGIN
  IF p_combat_state_id IS NULL
     OR p_turn_state_id IS NULL
     OR p_expected_turn_number IS NULL
     OR p_account_id IS NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_SUPPORT_ARGUMENT_REQUIRED';
  END IF;


  -- Combat row is the serialization boundary shared by
  -- terrain mutation and player support resolution.
  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.id = p_combat_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_FOUND';
  END IF;

  IF v_combat.status <> 'initialized' THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_SUPPORT_COMBAT_NOT_ACTIVE';
  END IF;


  IF p_account_id <>
       v_combat.player_one_account_id
     AND p_account_id <>
       v_combat.player_two_account_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_SUPPORT_ACCOUNT_INVALID';
  END IF;


  IF v_combat.rules_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.rules_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.rules_snapshot ->
            'player_hit_radius_px'
        ) <> 'number'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_SUPPORT_RULES_INVALID';
  END IF;


  v_hit_radius :=
    (
      v_combat.rules_snapshot ->>
        'player_hit_radius_px'
    )::numeric;

  IF v_hit_radius <= 0
     OR v_hit_radius =
        'NaN'::numeric
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_SUPPORT_RULES_INVALID';
  END IF;


  SELECT t.*
  INTO v_terrain
  FROM public.cing_artillery_combat_terrain_states AS t
  WHERE t.combat_state_id =
    v_combat.id;

  IF NOT FOUND
     OR v_terrain.match_runtime_id <>
        v_combat.match_runtime_id
     OR v_terrain.match_id <>
        v_combat.match_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_SUPPORT_TERRAIN_MISSING';
  END IF;


  SELECT p.*
  INTO v_player
  FROM public.cing_artillery_player_world_states AS p
  WHERE p.combat_state_id =
    v_combat.id
    AND p.account_id =
      p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_WORLD_STATE_MISSING';
  END IF;


  v_start_y :=
    v_player.position_y;


  v_supported :=
    public.cing_artillery_player_supported_private_v1(
      v_terrain.width_px,
      v_terrain.height_px,
      v_terrain.collision_mask,
      v_player.position_x,
      v_player.position_y,
      v_hit_radius
    );


  IF v_supported THEN
    IF v_player.motion_state <> 'stable' THEN
      v_now := clock_timestamp();

      UPDATE
        public.cing_artillery_player_world_states
      SET
        motion_state = 'stable',
        updated_at = v_now
      WHERE id = v_player.id;
    END IF;

    RETURN jsonb_build_object(
      'account_id',
      p_account_id,
      'outcome',
      'supported',
      'start_y',
      v_start_y,
      'end_y',
      v_start_y,
      'fall_distance_px',
      0,
      'terrain_revision',
      v_terrain.terrain_revision
    );
  END IF;


  v_landing_y :=
    NULL;

  FOR v_scan_y IN
    (v_player.position_y + 1)
    ..
    (v_terrain.height_px - 1)
  LOOP
    IF
      public.cing_artillery_player_supported_private_v1(
        v_terrain.width_px,
        v_terrain.height_px,
        v_terrain.collision_mask,
        v_player.position_x,
        v_scan_y,
        v_hit_radius
      )
    THEN
      v_landing_y :=
        v_scan_y;

      EXIT;
    END IF;
  END LOOP;


  IF v_landing_y IS NOT NULL THEN
    v_now := clock_timestamp();

    UPDATE
      public.cing_artillery_player_world_states
    SET
      position_y = v_landing_y,
      motion_state = 'stable',
      updated_at = v_now
    WHERE id = v_player.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_PLAYER_WORLD_UPDATE_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'account_id',
      p_account_id,
      'outcome',
      'landed',
      'start_y',
      v_start_y,
      'end_y',
      v_landing_y,
      'fall_distance_px',
      v_landing_y - v_start_y,
      'terrain_revision',
      v_terrain.terrain_revision
    );
  END IF;


  -- No support exists before the canonical map bottom.
  --
  -- Terminal lifecycle is delegated exclusively to the
  -- dedicated fell_out_of_world primitive.

  PERFORM
    public.cing_artillery_complete_fell_out_of_world_private(
      p_combat_state_id,
      p_turn_state_id,
      p_expected_turn_number,
      p_account_id
    );


  v_now := clock_timestamp();

  UPDATE
    public.cing_artillery_player_world_states
  SET
    position_y = v_terrain.height_px,
    motion_state = 'falling',
    updated_at = v_now
  WHERE id = v_player.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_WORLD_UPDATE_CONFLICT';
  END IF;


  RETURN jsonb_build_object(
    'account_id',
    p_account_id,
    'outcome',
    'fell_out_of_world',
    'start_y',
    v_start_y,
    'end_y',
    v_terrain.height_px,
    'fall_distance_px',
    v_terrain.height_px - v_start_y,
    'terrain_revision',
    v_terrain.terrain_revision
  );
END;
$$;


-- =====================================================
-- PRIVATE ACL
-- =====================================================

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_combat_terrain_private(
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_combat_terrain_private(
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_combat_terrain_private(
    uuid
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_combat_terrain_private(
    uuid
  )
FROM service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_terrain_pixel_solid_private_v1(
    integer,
    integer,
    bytea,
    integer,
    integer
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_terrain_pixel_solid_private_v1(
    integer,
    integer,
    bytea,
    integer,
    integer
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_terrain_pixel_solid_private_v1(
    integer,
    integer,
    bytea,
    integer,
    integer
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_terrain_pixel_solid_private_v1(
    integer,
    integer,
    bytea,
    integer,
    integer
  )
FROM service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_player_supported_private_v1(
    integer,
    integer,
    bytea,
    integer,
    integer,
    numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_player_supported_private_v1(
    integer,
    integer,
    bytea,
    integer,
    integer,
    numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_player_supported_private_v1(
    integer,
    integer,
    bytea,
    integer,
    integer,
    numeric
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_player_supported_private_v1(
    integer,
    integer,
    bytea,
    integer,
    integer,
    numeric
  )
FROM service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_resolve_player_support_private_v1(
    uuid,
    uuid,
    integer,
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_resolve_player_support_private_v1(
    uuid,
    uuid,
    integer,
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_resolve_player_support_private_v1(
    uuid,
    uuid,
    integer,
    uuid
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_resolve_player_support_private_v1(
    uuid,
    uuid,
    integer,
    uuid
  )
FROM service_role;


COMMIT;
