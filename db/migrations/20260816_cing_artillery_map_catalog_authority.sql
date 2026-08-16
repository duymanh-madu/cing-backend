BEGIN;

-- =====================================================
-- CING ARTILLERY — MAP CATALOG AUTHORITY FOUNDATION
--
-- Purpose:
--   durable/versioned authority for REAL playable maps.
--
-- This migration intentionally creates NO map rows.
--
-- No:
--   placeholder map
--   mock terrain
--   fallback spawn
--   hardcoded gameplay geometry
--   combat-world initialization
--   physics
--   damage
--
-- A map may become selectable only after a real,
-- validated production map version has been inserted.
--
-- PostgreSQL remains the durable final authority.
-- =====================================================


-- =====================================================
-- BITMASK_V1 CANONICAL FORMAT VALIDATOR
--
-- Encoding contract:
--
--   row-major
--   1 bit per pixel
--   MSB-first within each byte
--   each scanline is byte-aligned independently
--   unused low-order bits in the final byte of a row = 0
--
-- Example:
--
--   width = 10
--   bytes_per_row = 2
--
--   byte 0:
--     pixels x=0..7 map to bits 7..0
--
--   byte 1:
--     pixels x=8..9 map to bits 7..6
--     bits 5..0 MUST be zero padding
--
-- This guarantees one canonical byte representation for
-- one collision geometry.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_validate_collision_bitmask_v1(
    p_width_px integer,
    p_height_px integer,
    p_collision_mask bytea
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_bytes_per_row bigint;
  v_expected_bytes bigint;
  v_unused_bits integer;
  v_padding_mask integer;
  v_row bigint;
  v_last_byte_offset bigint;
BEGIN
  IF p_width_px <= 0
     OR p_height_px <= 0
  THEN
    RETURN false;
  END IF;

  v_bytes_per_row :=
    (
      p_width_px::bigint + 7
    ) / 8;

  v_expected_bytes :=
    v_bytes_per_row
    *
    p_height_px::bigint;

  IF octet_length(
       p_collision_mask
     )::bigint <>
       v_expected_bytes
  THEN
    RETURN false;
  END IF;

  /*
   * MSB-first encoding means unused bits, when present,
   * occupy the LOW-order side of the last byte.
   */
  v_unused_bits :=
    (
      v_bytes_per_row * 8
      -
      p_width_px::bigint
    )::integer;

  IF v_unused_bits = 0 THEN
    RETURN true;
  END IF;

  v_padding_mask :=
    (
      1 << v_unused_bits
    ) - 1;

  v_row :=
    0;

  WHILE v_row <
        p_height_px::bigint
  LOOP
    v_last_byte_offset :=
      (
        (v_row + 1)
        *
        v_bytes_per_row
      ) - 1;

    IF (
      get_byte(
        p_collision_mask,
        v_last_byte_offset::integer
      )
      &
      v_padding_mask
    ) <> 0
    THEN
      RETURN false;
    END IF;

    v_row :=
      v_row + 1;
  END LOOP;

  RETURN true;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_collision_bitmask_v1(
    integer,
    integer,
    bytea
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_collision_bitmask_v1(
    integer,
    integer,
    bytea
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_collision_bitmask_v1(
    integer,
    integer,
    bytea
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_validate_collision_bitmask_v1(
    integer,
    integer,
    bytea
  )
FROM service_role;


-- =====================================================
-- MAP VERSION CATALOG
--
-- Every row is one immutable playable map version.
--
-- map_key:
--   stable logical map identity.
--
-- version:
--   immutable content version.
--
-- collision_mask:
--   canonical server collision authority.
--   Representation is opaque at this layer but immutable
--   and protected by SHA-256 content identity.
--
-- collision_mask_sha256:
--   lower-case 64-character hex SHA-256.
--
-- render_asset_key:
--   immutable application asset identity. This is NOT a
--   URL and therefore does not bind durable authority to
--   any CDN/provider address.
--
-- enabled:
--   only enabled rows may later participate in combat
--   world selection.
--
-- No existing combat references this table yet.
-- =====================================================

CREATE TABLE
  public.cing_artillery_maps (
    id uuid PRIMARY KEY,

    map_key text NOT NULL,

    version integer NOT NULL,

    display_name text NOT NULL,

    width_px integer NOT NULL,

    height_px integer NOT NULL,

    collision_format text NOT NULL,

    collision_mask bytea NOT NULL,

    collision_mask_sha256 text NOT NULL,

    render_asset_key text NOT NULL,

    enabled boolean NOT NULL
      DEFAULT false,

    selection_weight integer NOT NULL
      DEFAULT 1,

    created_at timestamptz NOT NULL
      DEFAULT now(),

    updated_at timestamptz NOT NULL
      DEFAULT now(),

    CONSTRAINT
      cing_artillery_maps_map_key_check
      CHECK (
        map_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'
      ),

    CONSTRAINT
      cing_artillery_maps_version_check
      CHECK (
        version > 0
      ),

    CONSTRAINT
      cing_artillery_maps_display_name_check
      CHECK (
        btrim(display_name) <> ''
      ),

    CONSTRAINT
      cing_artillery_maps_dimensions_check
      CHECK (
        width_px > 0
        AND height_px > 0
      ),

    CONSTRAINT
      cing_artillery_maps_collision_format_check
      CHECK (
        collision_format =
          'bitmask_v1'
      ),

    CONSTRAINT
      cing_artillery_maps_collision_mask_check
      CHECK (
        public.cing_artillery_validate_collision_bitmask_v1(
          width_px,
          height_px,
          collision_mask
        )
      ),

    CONSTRAINT
      cing_artillery_maps_collision_hash_check
      CHECK (
        collision_mask_sha256 ~
          '^[0-9a-f]{64}$'
        AND collision_mask_sha256 =
          encode(
            extensions.digest(
              collision_mask,
              'sha256'
            ),
            'hex'
          )
      ),

    CONSTRAINT
      cing_artillery_maps_render_asset_key_check
      CHECK (
        btrim(
          render_asset_key
        ) <> ''
      ),

    CONSTRAINT
      cing_artillery_maps_selection_weight_check
      CHECK (
        selection_weight > 0
      )
  );


-- One immutable version number per logical map.
CREATE UNIQUE INDEX
  cing_artillery_maps_key_version_uidx
ON public.cing_artillery_maps (
  map_key,
  version
);


-- Immutable collision content cannot silently be reused
-- under conflicting content identity.
CREATE INDEX
  cing_artillery_maps_enabled_selection_idx
ON public.cing_artillery_maps (
  enabled,
  selection_weight,
  map_key,
  version
);


-- =====================================================
-- MAP SPAWN PAIRS
--
-- Spawn authority is normalized rather than embedded in
-- an unchecked JSON blob.
--
-- Each pair defines one valid 1v1 placement for a map.
--
-- side_a / side_b are map-local coordinates only.
-- Which account becomes A or B will be decided later by
-- combat-world initialization, never by the client.
-- =====================================================

CREATE TABLE
  public.cing_artillery_map_spawn_pairs (
    id uuid PRIMARY KEY,

    map_id uuid NOT NULL
      REFERENCES public.cing_artillery_maps(id)
      ON DELETE RESTRICT,

    spawn_key text NOT NULL,

    side_a_x integer NOT NULL,

    side_a_y integer NOT NULL,

    side_b_x integer NOT NULL,

    side_b_y integer NOT NULL,

    enabled boolean NOT NULL
      DEFAULT true,

    selection_weight integer NOT NULL
      DEFAULT 1,

    created_at timestamptz NOT NULL
      DEFAULT now(),

    CONSTRAINT
      cing_artillery_map_spawn_pairs_key_check
      CHECK (
        spawn_key ~
          '^[a-z0-9][a-z0-9_-]{1,63}$'
      ),

    CONSTRAINT
      cing_artillery_map_spawn_pairs_coordinates_check
      CHECK (
        side_a_x >= 0
        AND side_a_y >= 0
        AND side_b_x >= 0
        AND side_b_y >= 0
      ),

    CONSTRAINT
      cing_artillery_map_spawn_pairs_distinct_check
      CHECK (
        side_a_x <> side_b_x
        OR side_a_y <> side_b_y
      ),

    CONSTRAINT
      cing_artillery_map_spawn_pairs_selection_weight_check
      CHECK (
        selection_weight > 0
      )
  );


CREATE UNIQUE INDEX
  cing_artillery_map_spawn_pairs_map_key_uidx
ON public.cing_artillery_map_spawn_pairs (
  map_id,
  spawn_key
);


CREATE INDEX
  cing_artillery_map_spawn_pairs_selection_idx
ON public.cing_artillery_map_spawn_pairs (
  map_id,
  enabled,
  selection_weight,
  spawn_key
);


-- =====================================================
-- CROSS-TABLE SPAWN GEOMETRY AUTHORITY
--
-- A CHECK constraint cannot safely validate coordinates
-- against another table's width/height.
--
-- Therefore creation/update is private and will later be
-- exposed only through a validating SECURITY DEFINER RPC.
--
-- At this foundation checkpoint, direct application writes
-- are intentionally forbidden.
-- =====================================================


-- =====================================================
-- TABLE SECURITY
-- =====================================================

ALTER TABLE
  public.cing_artillery_maps
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
  public.cing_artillery_map_spawn_pairs
ENABLE ROW LEVEL SECURITY;


REVOKE ALL
ON TABLE
  public.cing_artillery_maps
FROM PUBLIC;

REVOKE ALL
ON TABLE
  public.cing_artillery_maps
FROM anon;

REVOKE ALL
ON TABLE
  public.cing_artillery_maps
FROM authenticated;

REVOKE ALL
ON TABLE
  public.cing_artillery_maps
FROM service_role;


REVOKE ALL
ON TABLE
  public.cing_artillery_map_spawn_pairs
FROM PUBLIC;

REVOKE ALL
ON TABLE
  public.cing_artillery_map_spawn_pairs
FROM anon;

REVOKE ALL
ON TABLE
  public.cing_artillery_map_spawn_pairs
FROM authenticated;

REVOKE ALL
ON TABLE
  public.cing_artillery_map_spawn_pairs
FROM service_role;


-- Application server may inspect catalog state.
-- Writes remain unavailable until the validating map
-- publication RPC is defined in a later authority step.
GRANT SELECT
ON TABLE
  public.cing_artillery_maps
TO service_role;

GRANT SELECT
ON TABLE
  public.cing_artillery_map_spawn_pairs
TO service_role;


-- =====================================================
-- PRODUCTION SAFETY POSTCONDITION
--
-- This migration MUST NOT create any gameplay map.
-- =====================================================

DO $$
DECLARE
  v_map_count bigint;
  v_spawn_count bigint;
BEGIN
  SELECT count(*)
  INTO v_map_count
  FROM public.cing_artillery_maps;

  SELECT count(*)
  INTO v_spawn_count
  FROM public.cing_artillery_map_spawn_pairs;

  IF v_map_count <> 0
     OR v_spawn_count <> 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_MAP_CATALOG_FOUNDATION_MUST_START_EMPTY';
  END IF;
END;
$$;

COMMIT;
