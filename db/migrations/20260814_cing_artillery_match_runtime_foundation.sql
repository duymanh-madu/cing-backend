BEGIN;

-- =====================================================
-- CING ARTILLERY — MATCH RUNTIME FOUNDATION
--
-- Scope:
--   durable runtime identity for an existing match
--   exact player/account/session snapshot from match
--   exactly one runtime per match
--   active gameplay-session eligibility at initialization
--
-- No:
--   Socket.IO room membership
--   Redis runtime state
--   presence/reconnect
--   combat state
--   turn state
--   projectile physics
--   HP/damage
--   ranking/economy/rewards
--   public exposure
--
-- PostgreSQL remains the durable final authority.
-- =====================================================

CREATE TABLE IF NOT EXISTS
  public.cing_artillery_match_runtimes (
    id uuid PRIMARY KEY,

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
      DEFAULT 'ready',

    initialized_at timestamptz NOT NULL
      DEFAULT now(),

    created_at timestamptz NOT NULL
      DEFAULT now(),

    updated_at timestamptz NOT NULL
      DEFAULT now(),

    CONSTRAINT
      cing_artillery_match_runtimes_status_check
      CHECK (
        status = 'ready'
      ),

    CONSTRAINT
      cing_artillery_match_runtimes_distinct_accounts_check
      CHECK (
        player_one_account_id <>
        player_two_account_id
      ),

    CONSTRAINT
      cing_artillery_match_runtimes_distinct_sessions_check
      CHECK (
        player_one_session_id <>
        player_two_session_id
      )
  );

-- One durable runtime per canonical match.
CREATE UNIQUE INDEX IF NOT EXISTS
  cing_artillery_match_runtimes_match_uidx
ON public.cing_artillery_match_runtimes (
  match_id
);

CREATE INDEX IF NOT EXISTS
  cing_artillery_match_runtimes_player_one_account_idx
ON public.cing_artillery_match_runtimes (
  player_one_account_id,
  initialized_at DESC
);

CREATE INDEX IF NOT EXISTS
  cing_artillery_match_runtimes_player_two_account_idx
ON public.cing_artillery_match_runtimes (
  player_two_account_id,
  initialized_at DESC
);

-- =====================================================
-- ATOMIC MATCH RUNTIME INITIALIZATION
--
-- Caller supplies only canonical match_id.
--
-- Player/account/session ownership is copied from
-- cing_artillery_matches and cannot be caller-forged.
--
-- Match + both gameplay sessions are locked before
-- initialization. Match runtime uniqueness is finalized
-- by PostgreSQL.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_get_or_create_match_runtime_atomic(
    p_match_id uuid
  )
RETURNS public.cing_artillery_match_runtimes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match
    public.cing_artillery_matches%ROWTYPE;

  v_player_one_session
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_player_two_session
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_runtime
    public.cing_artillery_match_runtimes%ROWTYPE;

  v_config jsonb;
BEGIN
  IF p_match_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE = 'CING_ARTILLERY_MATCH_ID_REQUIRED';
  END IF;

  -- Defense in depth:
  -- repository/RPC cannot bypass the dark feature gate.
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

  SELECT m.*
  INTO v_match
  FROM public.cing_artillery_matches AS m
  WHERE m.id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE = 'CING_ARTILLERY_MATCH_NOT_FOUND';
  END IF;

  IF v_match.status <> 'matched' THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE = 'CING_ARTILLERY_MATCH_NOT_RUNTIME_ELIGIBLE';
  END IF;

  -- Idempotent canonical re-entry.
  SELECT r.*
  INTO v_runtime
  FROM public.cing_artillery_match_runtimes AS r
  WHERE r.match_id = v_match.id;

  IF FOUND THEN
    RETURN v_runtime;
  END IF;

  -- Lock gameplay sessions in deterministic UUID order
  -- to avoid opposite lock acquisition order.
  PERFORM s.id
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id IN (
    v_match.player_one_session_id,
    v_match.player_two_session_id
  )
  ORDER BY s.id
  FOR UPDATE;

  SELECT s.*
  INTO v_player_one_session
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
      v_match.player_one_session_id
    AND s.account_id =
      v_match.player_one_account_id;

  IF NOT FOUND
     OR v_player_one_session.status <> 'active'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_MATCH_PLAYER_ONE_SESSION_NOT_ACTIVE';
  END IF;

  SELECT s.*
  INTO v_player_two_session
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
      v_match.player_two_session_id
    AND s.account_id =
      v_match.player_two_account_id;

  IF NOT FOUND
     OR v_player_two_session.status <> 'active'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_MATCH_PLAYER_TWO_SESSION_NOT_ACTIVE';
  END IF;

  INSERT INTO public.cing_artillery_match_runtimes (
    id,
    match_id,
    player_one_account_id,
    player_one_session_id,
    player_two_account_id,
    player_two_session_id,
    status
  )
  VALUES (
    gen_random_uuid(),
    v_match.id,
    v_match.player_one_account_id,
    v_match.player_one_session_id,
    v_match.player_two_account_id,
    v_match.player_two_session_id,
    'ready'
  )
  ON CONFLICT (
    match_id
  )
  DO NOTHING
  RETURNING *
  INTO v_runtime;

  IF v_runtime.id IS NULL THEN
    SELECT r.*
    INTO v_runtime
    FROM public.cing_artillery_match_runtimes AS r
    WHERE r.match_id =
      v_match.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_MATCH_RUNTIME_RESOLUTION_FAILED';
    END IF;
  END IF;

  -- Defensive authority check:
  -- existing canonical runtime must still exactly represent
  -- the immutable matchmaking result.
  IF v_runtime.player_one_account_id <>
       v_match.player_one_account_id
     OR v_runtime.player_one_session_id <>
       v_match.player_one_session_id
     OR v_runtime.player_two_account_id <>
       v_match.player_two_account_id
     OR v_runtime.player_two_session_id <>
       v_match.player_two_session_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_MATCH_RUNTIME_STATE_INCONSISTENT';
  END IF;

  RETURN v_runtime;
END;
$$;

-- Private server-side RPC only.
REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_match_runtime_atomic(
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_match_runtime_atomic(
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_match_runtime_atomic(
    uuid
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_get_or_create_match_runtime_atomic(
    uuid
  )
TO service_role;

COMMIT;
