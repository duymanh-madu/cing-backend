BEGIN;

-- =====================================================
-- CING ARTILLERY — TURN STATE AUTHORITY FOUNDATION
--
-- Durable authority:
--   exactly one turn state per canonical combat state
--
-- This phase intentionally initializes only PENDING state.
--
-- It does NOT decide:
--   first player
--   random turn order
--   combat start readiness
--   timeout transition
--   next-turn transition
--   shot authorization
--   projectile state
--   HP / damage
--   match completion
--
-- Those are separate authoritative transitions.
--
-- PostgreSQL remains the durable final authority.
-- =====================================================

CREATE TABLE IF NOT EXISTS
  public.cing_artillery_turn_states (
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
      DEFAULT 'pending',

    turn_number integer NOT NULL
      DEFAULT 0,

    active_account_id uuid
      REFERENCES public.cing_artillery_accounts(id)
      ON DELETE RESTRICT,

    active_session_id uuid
      REFERENCES public.cing_artillery_gameplay_sessions(id)
      ON DELETE RESTRICT,

    turn_started_at timestamptz,

    turn_deadline_at timestamptz,

    created_at timestamptz NOT NULL
      DEFAULT now(),

    updated_at timestamptz NOT NULL
      DEFAULT now(),

    CONSTRAINT
      cing_artillery_turn_states_status_check
      CHECK (
        status IN (
          'pending',
          'active'
        )
      ),

    CONSTRAINT
      cing_artillery_turn_states_turn_number_check
      CHECK (
        turn_number >= 0
      ),

    CONSTRAINT
      cing_artillery_turn_states_distinct_accounts_check
      CHECK (
        player_one_account_id <>
        player_two_account_id
      ),

    CONSTRAINT
      cing_artillery_turn_states_distinct_sessions_check
      CHECK (
        player_one_session_id <>
        player_two_session_id
      ),

    CONSTRAINT
      cing_artillery_turn_states_lifecycle_check
      CHECK (
        (
          status = 'pending'
          AND turn_number = 0
          AND active_account_id IS NULL
          AND active_session_id IS NULL
          AND turn_started_at IS NULL
          AND turn_deadline_at IS NULL
        )
        OR
        (
          status = 'active'
          AND turn_number > 0
          AND active_account_id IS NOT NULL
          AND active_session_id IS NOT NULL
          AND turn_started_at IS NOT NULL
          AND turn_deadline_at IS NOT NULL
          AND turn_deadline_at >
              turn_started_at
        )
      ),

    CONSTRAINT
      cing_artillery_turn_states_active_participant_check
      CHECK (
        active_account_id IS NULL
        OR
        (
          active_account_id =
            player_one_account_id
          AND active_session_id =
            player_one_session_id
        )
        OR
        (
          active_account_id =
            player_two_account_id
          AND active_session_id =
            player_two_session_id
        )
      )
  );

-- Exactly one durable turn authority per combat state.
CREATE UNIQUE INDEX IF NOT EXISTS
  cing_artillery_turn_states_combat_state_uidx
ON public.cing_artillery_turn_states (
  combat_state_id
);

-- Defensive one-to-one authority chain.
CREATE UNIQUE INDEX IF NOT EXISTS
  cing_artillery_turn_states_match_runtime_uidx
ON public.cing_artillery_turn_states (
  match_runtime_id
);

CREATE UNIQUE INDEX IF NOT EXISTS
  cing_artillery_turn_states_match_uidx
ON public.cing_artillery_turn_states (
  match_id
);

CREATE INDEX IF NOT EXISTS
  cing_artillery_turn_states_active_deadline_idx
ON public.cing_artillery_turn_states (
  turn_deadline_at
)
WHERE status = 'active';

-- =====================================================
-- ATOMIC TURN STATE INITIALIZATION
--
-- Caller supplies only canonical combat_state_id.
--
-- Every participant/match/runtime identifier is copied
-- from combat state and can never be caller-forged.
--
-- No first-player decision is made here.
-- Initial lifecycle is always canonical PENDING.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_get_or_create_turn_state_atomic(
    p_combat_state_id uuid
  )
RETURNS public.cing_artillery_turn_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_state
    public.cing_artillery_turn_states%ROWTYPE;

  v_config jsonb;
BEGIN
  IF p_combat_state_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_ID_REQUIRED';
  END IF;

  -- Defense in depth:
  -- service-role RPC cannot bypass the dark feature gate.
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
  )::boolean THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_disabled';
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

  IF v_combat.status <>
       'initialized'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_TURN_ELIGIBLE';
  END IF;

  -- Turn authority depends on a complete immutable
  -- combat rule snapshot, but does not duplicate it.
  IF v_combat.rules_version IS NULL
     OR v_combat.rules_version <= 0
     OR v_combat.rules_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.rules_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.rules_snapshot ->
            'turn_duration_ms'
        ) <> 'number'
     OR (
          v_combat.rules_snapshot ->>
            'turn_duration_ms'
        )::numeric <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_TURN_ELIGIBLE';
  END IF;

  SELECT s.*
  INTO v_state
  FROM public.cing_artillery_turn_states AS s
  WHERE s.combat_state_id =
    v_combat.id;

  IF FOUND THEN
    IF v_state.match_runtime_id <>
         v_combat.match_runtime_id
       OR v_state.match_id <>
         v_combat.match_id
       OR v_state.player_one_account_id <>
         v_combat.player_one_account_id
       OR v_state.player_one_session_id <>
         v_combat.player_one_session_id
       OR v_state.player_two_account_id <>
         v_combat.player_two_account_id
       OR v_state.player_two_session_id <>
         v_combat.player_two_session_id
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_TURN_STATE_INCONSISTENT';
    END IF;

    RETURN v_state;
  END IF;

  INSERT INTO public.cing_artillery_turn_states (
    id,
    combat_state_id,
    match_runtime_id,
    match_id,
    player_one_account_id,
    player_one_session_id,
    player_two_account_id,
    player_two_session_id,
    status,
    turn_number
  )
  VALUES (
    gen_random_uuid(),
    v_combat.id,
    v_combat.match_runtime_id,
    v_combat.match_id,
    v_combat.player_one_account_id,
    v_combat.player_one_session_id,
    v_combat.player_two_account_id,
    v_combat.player_two_session_id,
    'pending',
    0
  )
  ON CONFLICT (
    combat_state_id
  )
  DO NOTHING
  RETURNING *
  INTO v_state;

  IF v_state.id IS NULL THEN
    SELECT s.*
    INTO v_state
    FROM public.cing_artillery_turn_states AS s
    WHERE s.combat_state_id =
      v_combat.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_TURN_STATE_RESOLUTION_FAILED';
    END IF;
  END IF;

  IF v_state.match_runtime_id <>
       v_combat.match_runtime_id
     OR v_state.match_id <>
       v_combat.match_id
     OR v_state.player_one_account_id <>
       v_combat.player_one_account_id
     OR v_state.player_one_session_id <>
       v_combat.player_one_session_id
     OR v_state.player_two_account_id <>
       v_combat.player_two_account_id
     OR v_state.player_two_session_id <>
       v_combat.player_two_session_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TURN_STATE_INCONSISTENT';
  END IF;

  RETURN v_state;
END;
$$;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_turn_state_atomic(
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_turn_state_atomic(
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_turn_state_atomic(
    uuid
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_get_or_create_turn_state_atomic(
    uuid
  )
TO service_role;

COMMIT;
