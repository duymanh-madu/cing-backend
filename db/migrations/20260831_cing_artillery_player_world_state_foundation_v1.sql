BEGIN;

-- =====================================================
-- CING PIU PIU — PLAYER WORLD STATE FOUNDATION V1
--
-- Purpose:
--
--   Introduce canonical mutable player position authority
--   without mutating immutable combat-world spawn provenance.
--
-- Coordinate semantics:
--
--   position_x / position_y are integer ground-contact
--   coordinates in canonical map pixel space.
--
--   combat_world_states.player_*_x/y remain immutable spawn
--   provenance.
--
-- This migration intentionally does NOT yet:
--
--   mutate terrain
--   simulate gravity
--   resolve support after crater mutation
--   call fell_out_of_world terminal transition
--   redefine projectile out_of_bounds
--
-- Those operations consume this authority in the next stage.
-- =====================================================


CREATE TABLE
  public.cing_artillery_player_world_states (
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

    gameplay_session_id uuid NOT NULL
      REFERENCES public.cing_artillery_gameplay_sessions(id)
      ON DELETE RESTRICT,

    account_id uuid NOT NULL,

    participant_slot smallint NOT NULL,

    position_x integer NOT NULL,

    position_y integer NOT NULL,

    motion_state text NOT NULL
      DEFAULT 'stable',

    initialized_at timestamptz NOT NULL,

    updated_at timestamptz NOT NULL,

    CONSTRAINT
      cing_artillery_player_world_states_participant_slot_check
      CHECK (
        participant_slot IN (1, 2)
      ),

    CONSTRAINT
      cing_artillery_player_world_states_position_check
      CHECK (
        position_x >= 0
        AND position_y >= 0
      ),

    CONSTRAINT
      cing_artillery_player_world_states_motion_state_check
      CHECK (
        motion_state IN (
          'stable',
          'falling'
        )
      ),

    CONSTRAINT
      cing_artillery_player_world_states_timestamp_check
      CHECK (
        updated_at >= initialized_at
      )
  );


CREATE UNIQUE INDEX
  cing_artillery_player_world_states_combat_slot_uidx
ON public.cing_artillery_player_world_states (
  combat_state_id,
  participant_slot
);


CREATE UNIQUE INDEX
  cing_artillery_player_world_states_combat_account_uidx
ON public.cing_artillery_player_world_states (
  combat_state_id,
  account_id
);


CREATE UNIQUE INDEX
  cing_artillery_player_world_states_session_uidx
ON public.cing_artillery_player_world_states (
  gameplay_session_id
);


CREATE INDEX
  cing_artillery_player_world_states_runtime_idx
ON public.cing_artillery_player_world_states (
  match_runtime_id,
  participant_slot
);


-- =====================================================
-- ACCESS AUTHORITY
--
-- Durable mutable player-world state is private authority.
-- No application role may mutate or directly read it.
-- =====================================================

ALTER TABLE
  public.cing_artillery_player_world_states
ENABLE ROW LEVEL SECURITY;


REVOKE ALL
ON TABLE
  public.cing_artillery_player_world_states
FROM PUBLIC;


REVOKE ALL
ON TABLE
  public.cing_artillery_player_world_states
FROM anon;


REVOKE ALL
ON TABLE
  public.cing_artillery_player_world_states
FROM authenticated;


REVOKE ALL
ON TABLE
  public.cing_artillery_player_world_states
FROM service_role;


-- =====================================================
-- PRIVATE INITIALIZATION PRIMITIVE
--
-- Canonical lock order:
--
--   combat
--     -> combat world
--     -> both gameplay sessions
--
-- Initial position is copied exactly once from immutable
-- combat-world spawn provenance.
--
-- No caller-supplied coordinates.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_get_or_create_player_world_states_private(
    p_combat_state_id uuid
  )
RETURNS SETOF public.cing_artillery_player_world_states
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_world
    public.cing_artillery_combat_world_states%ROWTYPE;

  v_session_one
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_session_two
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_existing_count integer;

  v_initialized_at timestamptz;
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
          'CING_ARTILLERY_PLAYER_WORLD_COMBAT_NOT_ACTIVE';
  END IF;


  SELECT w.*
  INTO v_world
  FROM public.cing_artillery_combat_world_states AS w
  WHERE w.combat_state_id = v_combat.id
  FOR UPDATE;

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
          'CING_ARTILLERY_PLAYER_WORLD_COMBAT_WORLD_INVALID';
  END IF;


  -- Existing state is valid only as an exact two-row authority.
  SELECT count(*)
  INTO v_existing_count
  FROM public.cing_artillery_player_world_states AS p
  WHERE p.combat_state_id = v_combat.id;

  IF v_existing_count = 2 THEN
    RETURN QUERY
      SELECT p.*
      FROM public.cing_artillery_player_world_states AS p
      WHERE p.combat_state_id = v_combat.id
      ORDER BY p.participant_slot;

    RETURN;
  END IF;

  IF v_existing_count <> 0 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_WORLD_PARTIAL_STATE';
  END IF;


  -- Preserve deterministic session lock ordering.
  PERFORM s.id
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id IN (
    v_combat.player_one_gameplay_session_id,
    v_combat.player_two_gameplay_session_id
  )
  ORDER BY s.id
  FOR UPDATE;


  SELECT s.*
  INTO v_session_one
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
    v_combat.player_one_gameplay_session_id
    AND s.account_id =
      v_combat.player_one_account_id;

  IF NOT FOUND
     OR v_session_one.status <> 'active'
     OR v_session_one.ended_at IS NOT NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_ONE_SESSION_INVALID';
  END IF;


  SELECT s.*
  INTO v_session_two
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
    v_combat.player_two_gameplay_session_id
    AND s.account_id =
      v_combat.player_two_account_id;

  IF NOT FOUND
     OR v_session_two.status <> 'active'
     OR v_session_two.ended_at IS NOT NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_TWO_SESSION_INVALID';
  END IF;


  v_initialized_at := clock_timestamp();


  INSERT INTO public.cing_artillery_player_world_states (
    id,
    combat_state_id,
    match_runtime_id,
    match_id,
    gameplay_session_id,
    account_id,
    participant_slot,
    position_x,
    position_y,
    motion_state,
    initialized_at,
    updated_at
  )
  VALUES
    (
      gen_random_uuid(),
      v_combat.id,
      v_combat.match_runtime_id,
      v_combat.match_id,
      v_combat.player_one_gameplay_session_id,
      v_combat.player_one_account_id,
      1,
      v_world.player_one_x,
      v_world.player_one_y,
      'stable',
      v_initialized_at,
      v_initialized_at
    ),
    (
      gen_random_uuid(),
      v_combat.id,
      v_combat.match_runtime_id,
      v_combat.match_id,
      v_combat.player_two_gameplay_session_id,
      v_combat.player_two_account_id,
      2,
      v_world.player_two_x,
      v_world.player_two_y,
      'stable',
      v_initialized_at,
      v_initialized_at
    );


  RETURN QUERY
    SELECT p.*
    FROM public.cing_artillery_player_world_states AS p
    WHERE p.combat_state_id = v_combat.id
    ORDER BY p.participant_slot;
END;
$$;


-- =====================================================
-- PRIVATE PRIVILEGE BOUNDARY
-- =====================================================

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_player_world_states_private(
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_player_world_states_private(
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_player_world_states_private(
    uuid
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_player_world_states_private(
    uuid
  )
FROM service_role;


COMMIT;
