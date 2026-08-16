BEGIN;

-- =====================================================
-- CING ARTILLERY — COMBAT VITAL STATE FOUNDATION
--
-- Purpose:
--   durable mutable HP authority for one canonical combat
--
-- Immutable authority:
--   cing_artillery_combat_states
--     player_one_stats_snapshot.max_hp
--     player_two_stats_snapshot.max_hp
--
-- Mutable authority:
--   cing_artillery_combat_vital_states
--     player_one_current_hp
--     player_two_current_hp
--
-- Exactly one vital state exists per combat state.
--
-- Initialization is atomic and idempotent.
-- Caller supplies only combat_state_id.
--
-- Current HP is NEVER caller supplied.
-- Initial HP is copied exclusively from the immutable
-- per-combat stat snapshots.
--
-- Intentionally NOT implemented here:
--   damage application
--   healing
--   death
--   winner / loser
--   combat completion
--   turn advancement
--   realtime publication
--
-- PostgreSQL remains final gameplay-state authority.
-- =====================================================

CREATE TABLE
  public.cing_artillery_combat_vital_states (
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

    player_one_account_id uuid NOT NULL
      REFERENCES public.cing_artillery_accounts(id)
      ON DELETE RESTRICT,

    player_two_account_id uuid NOT NULL
      REFERENCES public.cing_artillery_accounts(id)
      ON DELETE RESTRICT,

    player_one_current_hp numeric NOT NULL,

    player_two_current_hp numeric NOT NULL,

    initialized_at timestamptz NOT NULL
      DEFAULT now(),

    updated_at timestamptz NOT NULL
      DEFAULT now(),

    created_at timestamptz NOT NULL
      DEFAULT now(),

    CONSTRAINT
      cing_artillery_combat_vital_states_distinct_accounts_check
      CHECK (
        player_one_account_id <>
        player_two_account_id
      ),

    CONSTRAINT
      cing_artillery_combat_vital_states_player_one_hp_finite_check
      CHECK (
        player_one_current_hp <> 'NaN'::numeric
        AND player_one_current_hp <> 'Infinity'::numeric
        AND player_one_current_hp <> '-Infinity'::numeric
        AND player_one_current_hp >= 0
      ),

    CONSTRAINT
      cing_artillery_combat_vital_states_player_two_hp_finite_check
      CHECK (
        player_two_current_hp <> 'NaN'::numeric
        AND player_two_current_hp <> 'Infinity'::numeric
        AND player_two_current_hp <> '-Infinity'::numeric
        AND player_two_current_hp >= 0
      ),

    CONSTRAINT
      cing_artillery_combat_vital_states_combat_uidx
      UNIQUE (
        combat_state_id
      ),

    CONSTRAINT
      cing_artillery_combat_vital_states_runtime_uidx
      UNIQUE (
        match_runtime_id
      ),

    CONSTRAINT
      cing_artillery_combat_vital_states_match_uidx
      UNIQUE (
        match_id
      )
  );

CREATE INDEX
  cing_artillery_combat_vital_states_player_one_idx
ON public.cing_artillery_combat_vital_states (
  player_one_account_id,
  created_at DESC
);

CREATE INDEX
  cing_artillery_combat_vital_states_player_two_idx
ON public.cing_artillery_combat_vital_states (
  player_two_account_id,
  created_at DESC
);

-- =====================================================
-- ATOMIC VITAL INITIALIZATION
--
-- The combat-state row is locked first.
--
-- Initial current HP comes only from immutable combat
-- stat snapshots. No live config or character row is
-- consulted here.
--
-- This guarantees that later configuration/progression
-- changes cannot alter an already-started combat.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_get_or_create_combat_vital_state_atomic(
    p_combat_state_id uuid
  )
RETURNS public.cing_artillery_combat_vital_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_vital
    public.cing_artillery_combat_vital_states%ROWTYPE;

  v_player_one_max_hp numeric;
  v_player_two_max_hp numeric;
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

  /*
   * Existing combat state is canonical immutable
   * initialization authority.
   *
   * Fail closed if its required stat snapshots do not
   * expose valid max_hp values.
   */
  IF v_combat.player_one_stats_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.player_one_stats_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.player_one_stats_snapshot -> 'max_hp'
        ) <> 'number'
     OR v_combat.player_two_stats_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.player_two_stats_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.player_two_stats_snapshot -> 'max_hp'
        ) <> 'number'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATS_SNAPSHOT_INVALID';
  END IF;

  BEGIN
    v_player_one_max_hp :=
      (
        v_combat.player_one_stats_snapshot ->> 'max_hp'
      )::numeric;

    v_player_two_max_hp :=
      (
        v_combat.player_two_stats_snapshot ->> 'max_hp'
      )::numeric;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_STATS_SNAPSHOT_INVALID';
  END;

  IF v_player_one_max_hp IS NULL
     OR v_player_one_max_hp = 'NaN'::numeric
     OR v_player_one_max_hp = 'Infinity'::numeric
     OR v_player_one_max_hp = '-Infinity'::numeric
     OR v_player_one_max_hp <= 0
     OR v_player_two_max_hp IS NULL
     OR v_player_two_max_hp = 'NaN'::numeric
     OR v_player_two_max_hp = 'Infinity'::numeric
     OR v_player_two_max_hp = '-Infinity'::numeric
     OR v_player_two_max_hp <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATS_SNAPSHOT_INVALID';
  END IF;

  /*
   * Idempotent re-entry.
   *
   * Existing mutable HP must NOT be compared with max_hp:
   * after damage is introduced current_hp is expected to
   * diverge from its immutable initial value.
   *
   * Identity, however, may never drift.
   */
  SELECT v.*
  INTO v_vital
  FROM public.cing_artillery_combat_vital_states AS v
  WHERE v.combat_state_id =
    v_combat.id;

  IF FOUND THEN
    IF v_vital.match_runtime_id <>
         v_combat.match_runtime_id
       OR v_vital.match_id <>
         v_combat.match_id
       OR v_vital.player_one_account_id <>
         v_combat.player_one_account_id
       OR v_vital.player_two_account_id <>
         v_combat.player_two_account_id
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_VITAL_STATE_INCONSISTENT';
    END IF;

    RETURN v_vital;
  END IF;

  INSERT INTO
    public.cing_artillery_combat_vital_states (
      id,
      combat_state_id,
      match_runtime_id,
      match_id,
      player_one_account_id,
      player_two_account_id,
      player_one_current_hp,
      player_two_current_hp
    )
  VALUES (
    gen_random_uuid(),
    v_combat.id,
    v_combat.match_runtime_id,
    v_combat.match_id,
    v_combat.player_one_account_id,
    v_combat.player_two_account_id,
    v_player_one_max_hp,
    v_player_two_max_hp
  )
  ON CONFLICT (
    combat_state_id
  )
  DO NOTHING
  RETURNING *
  INTO v_vital;

  IF v_vital.id IS NULL THEN
    SELECT v.*
    INTO v_vital
    FROM public.cing_artillery_combat_vital_states AS v
    WHERE v.combat_state_id =
      v_combat.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_VITAL_STATE_RESOLUTION_FAILED';
    END IF;
  END IF;

  IF v_vital.match_runtime_id <>
       v_combat.match_runtime_id
     OR v_vital.match_id <>
       v_combat.match_id
     OR v_vital.player_one_account_id <>
       v_combat.player_one_account_id
     OR v_vital.player_two_account_id <>
       v_combat.player_two_account_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_VITAL_STATE_INCONSISTENT';
  END IF;

  RETURN v_vital;
END;
$$;

-- =====================================================
-- ACCESS BOUNDARY
--
-- Application may read canonical HP state.
-- Mutation is unavailable through table privileges.
--
-- Future HP mutation must be introduced through a fenced
-- SECURITY DEFINER gameplay RPC.
-- =====================================================

ALTER TABLE
  public.cing_artillery_combat_vital_states
ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE
  public.cing_artillery_combat_vital_states
FROM PUBLIC;

REVOKE ALL
ON TABLE
  public.cing_artillery_combat_vital_states
FROM anon;

REVOKE ALL
ON TABLE
  public.cing_artillery_combat_vital_states
FROM authenticated;

REVOKE ALL
ON TABLE
  public.cing_artillery_combat_vital_states
FROM service_role;

GRANT SELECT
ON TABLE
  public.cing_artillery_combat_vital_states
TO service_role;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_combat_vital_state_atomic(
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_combat_vital_state_atomic(
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_combat_vital_state_atomic(
    uuid
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_get_or_create_combat_vital_state_atomic(
    uuid
  )
TO service_role;

COMMIT;
