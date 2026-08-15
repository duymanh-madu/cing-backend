BEGIN;

-- =====================================================
-- CING ARTILLERY — COMBAT STATE FOUNDATION
--
-- Scope:
--   durable combat-state identity for an existing runtime
--   exact runtime/match/player/session authority snapshot
--   exactly one combat state per runtime
--   atomic/idempotent initialization
--
-- Intentionally NOT defined in this phase:
--   HP / max HP
--   turn ownership / turn timer
--   positions / spawn coordinates
--   terrain
--   wind
--   angle / power
--   projectile physics
--   damage formula
--   scoring / economy / rewards
--
-- Those values require canonical game-rule/config authority
-- and must not be hardcoded into persistence.
--
-- PostgreSQL remains the durable final authority.
-- =====================================================

CREATE TABLE IF NOT EXISTS
  public.cing_artillery_combat_states (
    id uuid PRIMARY KEY,

    match_runtime_id uuid NOT NULL
      REFERENCES public.cing_artillery_match_runtimes(id)
      ON DELETE RESTRICT,

    match_id uuid NOT NULL
      REFERENCES public.cing_artillery_matches(id)
      ON DELETE RESTRICT,

    player_one_account_id uuid NOT NULL
      REFERENCES public.cing_artillery_accounts(id)
      ON DELETE RESTRICT,

    player_one_session_id uuid NOT NULL
      REFERENCES public.cing_artillery_gameplay_sessions(id)
      ON DELETE RESTRICT,

    player_two_account_id uuid NOT NULL
      REFERENCES public.cing_artillery_accounts(id)
      ON DELETE RESTRICT,

    player_two_session_id uuid NOT NULL
      REFERENCES public.cing_artillery_gameplay_sessions(id)
      ON DELETE RESTRICT,

    status text NOT NULL
      DEFAULT 'initialized',

    initialized_at timestamptz NOT NULL
      DEFAULT now(),

    created_at timestamptz NOT NULL
      DEFAULT now(),

    updated_at timestamptz NOT NULL
      DEFAULT now(),

    CONSTRAINT
      cing_artillery_combat_states_status_check
      CHECK (
        status = 'initialized'
      ),

    CONSTRAINT
      cing_artillery_combat_states_distinct_accounts_check
      CHECK (
        player_one_account_id <>
        player_two_account_id
      ),

    CONSTRAINT
      cing_artillery_combat_states_distinct_sessions_check
      CHECK (
        player_one_session_id <>
        player_two_session_id
      )
  );

-- Exactly one durable combat state per canonical runtime.
CREATE UNIQUE INDEX IF NOT EXISTS
  cing_artillery_combat_states_runtime_uidx
ON public.cing_artillery_combat_states (
  match_runtime_id
);

-- Defensive one-to-one relationship with canonical match.
CREATE UNIQUE INDEX IF NOT EXISTS
  cing_artillery_combat_states_match_uidx
ON public.cing_artillery_combat_states (
  match_id
);

CREATE INDEX IF NOT EXISTS
  cing_artillery_combat_states_player_one_account_idx
ON public.cing_artillery_combat_states (
  player_one_account_id,
  initialized_at DESC
);

CREATE INDEX IF NOT EXISTS
  cing_artillery_combat_states_player_two_account_idx
ON public.cing_artillery_combat_states (
  player_two_account_id,
  initialized_at DESC
);

-- =====================================================
-- ATOMIC COMBAT STATE INITIALIZATION
--
-- Caller supplies only canonical match_runtime_id.
--
-- Match/player/session authority is copied exclusively
-- from cing_artillery_match_runtimes and cannot be
-- caller-forged.
--
-- Runtime is locked before initialization.
-- PostgreSQL finalizes one-state-per-runtime concurrency.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_get_or_create_combat_state_atomic(
    p_match_runtime_id uuid
  )
RETURNS public.cing_artillery_combat_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_runtime
    public.cing_artillery_match_runtimes%ROWTYPE;

  v_state
    public.cing_artillery_combat_states%ROWTYPE;

  v_config jsonb;
BEGIN
  IF p_match_runtime_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_MATCH_RUNTIME_ID_REQUIRED';
  END IF;

  -- Defense in depth:
  -- private RPC cannot bypass the dark feature gate.
  SELECT
    cing_artillery_config
  INTO
    v_config
  FROM public.app_configs
  WHERE id = 1;

  IF NOT FOUND
     OR v_config IS NULL
     OR jsonb_typeof(v_config) <> 'object'
     OR jsonb_typeof(
          v_config -> 'enabled'
        ) <> 'boolean'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE = 'cing_artillery_config_invalid';
  END IF;

  IF NOT (
    v_config ->> 'enabled'
  )::boolean THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE = 'cing_artillery_disabled';
  END IF;

  SELECT r.*
  INTO v_runtime
  FROM public.cing_artillery_match_runtimes AS r
  WHERE r.id = p_match_runtime_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_MATCH_RUNTIME_NOT_FOUND';
  END IF;

  IF v_runtime.status <> 'ready' THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_MATCH_RUNTIME_NOT_COMBAT_ELIGIBLE';
  END IF;

  -- Idempotent canonical re-entry.
  SELECT s.*
  INTO v_state
  FROM public.cing_artillery_combat_states AS s
  WHERE s.match_runtime_id = v_runtime.id;

  IF FOUND THEN
    -- Existing state must still represent the runtime
    -- exactly. Never silently accept authority drift.
    IF v_state.match_id <>
         v_runtime.match_id
       OR v_state.player_one_account_id <>
         v_runtime.player_one_account_id
       OR v_state.player_one_session_id <>
         v_runtime.player_one_session_id
       OR v_state.player_two_account_id <>
         v_runtime.player_two_account_id
       OR v_state.player_two_session_id <>
         v_runtime.player_two_session_id
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_STATE_INCONSISTENT';
    END IF;

    RETURN v_state;
  END IF;

  INSERT INTO public.cing_artillery_combat_states (
    id,
    match_runtime_id,
    match_id,
    player_one_account_id,
    player_one_session_id,
    player_two_account_id,
    player_two_session_id,
    status
  )
  VALUES (
    gen_random_uuid(),
    v_runtime.id,
    v_runtime.match_id,
    v_runtime.player_one_account_id,
    v_runtime.player_one_session_id,
    v_runtime.player_two_account_id,
    v_runtime.player_two_session_id,
    'initialized'
  )
  ON CONFLICT (
    match_runtime_id
  )
  DO NOTHING
  RETURNING *
  INTO v_state;

  IF v_state.id IS NULL THEN
    SELECT s.*
    INTO v_state
    FROM public.cing_artillery_combat_states AS s
    WHERE s.match_runtime_id = v_runtime.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_STATE_RESOLUTION_FAILED';
    END IF;
  END IF;

  -- Defensive authority check after conflict resolution.
  IF v_state.match_id <>
       v_runtime.match_id
     OR v_state.player_one_account_id <>
       v_runtime.player_one_account_id
     OR v_state.player_one_session_id <>
       v_runtime.player_one_session_id
     OR v_state.player_two_account_id <>
       v_runtime.player_two_account_id
     OR v_state.player_two_session_id <>
       v_runtime.player_two_session_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_INCONSISTENT';
  END IF;

  RETURN v_state;
END;
$$;

-- Private server-side RPC only.
REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_combat_state_atomic(
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_combat_state_atomic(
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_combat_state_atomic(
    uuid
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_get_or_create_combat_state_atomic(
    uuid
  )
TO service_role;

COMMIT;
