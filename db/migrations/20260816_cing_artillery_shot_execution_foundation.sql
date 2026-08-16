BEGIN;

-- =====================================================
-- CING ARTILLERY — SHOT EXECUTION DURABLE FOUNDATION
--
-- Guarantees:
--
--   accepted shot command
--       ->
--   exactly one durable execution
--
-- Execution lifecycle:
--
--   pending
--     ->
--   processing
--     ->
--   completed
--
-- Expired processing leases are recoverable to pending.
--
-- No terminal infrastructure-failure gameplay state exists
-- in this foundation.
--
-- A per-claim UUID fencing token prevents a stale worker
-- from completing or releasing a later worker's claim.
--
-- No projectile physics, collision, damage, HP mutation,
-- scoring, turn transition or match completion exists here.
-- =====================================================

CREATE TABLE IF NOT EXISTS
  public.cing_artillery_shot_executions (
    id uuid PRIMARY KEY,

    shot_command_id uuid NOT NULL
      REFERENCES public.cing_artillery_shot_commands(id)
      ON DELETE RESTRICT,

    combat_state_id uuid NOT NULL
      REFERENCES public.cing_artillery_combat_states(id)
      ON DELETE RESTRICT,

    turn_state_id uuid NOT NULL
      REFERENCES public.cing_artillery_turn_states(id)
      ON DELETE RESTRICT,

    match_runtime_id uuid NOT NULL
      REFERENCES public.cing_artillery_match_runtimes(id)
      ON DELETE RESTRICT,

    match_id uuid NOT NULL
      REFERENCES public.cing_artillery_matches(id)
      ON DELETE RESTRICT,

    turn_number integer NOT NULL,

    status text NOT NULL
      DEFAULT 'pending',

    attempt_count integer NOT NULL
      DEFAULT 0,

    claim_token uuid,

    claimed_at timestamptz,

    locked_until timestamptz,

    last_error text,

    completed_at timestamptz,

    created_at timestamptz NOT NULL
      DEFAULT now(),

    updated_at timestamptz NOT NULL
      DEFAULT now(),

    CONSTRAINT
      cing_artillery_shot_executions_turn_number_check
      CHECK (
        turn_number > 0
      ),

    CONSTRAINT
      cing_artillery_shot_executions_attempt_count_check
      CHECK (
        attempt_count >= 0
      ),

    CONSTRAINT
      cing_artillery_shot_executions_status_check
      CHECK (
        status IN (
          'pending',
          'processing',
          'completed'
        )
      ),

    CONSTRAINT
      cing_artillery_shot_executions_lifecycle_check
      CHECK (
        (
          status = 'pending'
          AND claim_token IS NULL
          AND claimed_at IS NULL
          AND locked_until IS NULL
          AND completed_at IS NULL
        )
        OR
        (
          status = 'processing'
          AND claim_token IS NOT NULL
          AND claimed_at IS NOT NULL
          AND locked_until IS NOT NULL
          AND locked_until > claimed_at
          AND completed_at IS NULL
        )
        OR
        (
          status = 'completed'
          AND claim_token IS NOT NULL
          AND claimed_at IS NOT NULL
          AND locked_until IS NULL
          AND completed_at IS NOT NULL
          AND completed_at >= claimed_at
        )
      )
  );

ALTER TABLE
  public.cing_artillery_shot_executions
ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE
  public.cing_artillery_shot_executions
FROM PUBLIC;

REVOKE ALL
ON TABLE
  public.cing_artillery_shot_executions
FROM anon;

REVOKE ALL
ON TABLE
  public.cing_artillery_shot_executions
FROM authenticated;

REVOKE ALL
ON TABLE
  public.cing_artillery_shot_executions
FROM service_role;

GRANT SELECT
ON TABLE
  public.cing_artillery_shot_executions
TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS
  cing_artillery_shot_executions_shot_command_uidx
ON public.cing_artillery_shot_executions (
  shot_command_id
);

CREATE UNIQUE INDEX IF NOT EXISTS
  cing_artillery_shot_executions_combat_turn_uidx
ON public.cing_artillery_shot_executions (
  combat_state_id,
  turn_number
);

CREATE INDEX IF NOT EXISTS
  cing_artillery_shot_executions_pending_idx
ON public.cing_artillery_shot_executions (
  created_at,
  id
)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS
  cing_artillery_shot_executions_lease_idx
ON public.cing_artillery_shot_executions (
  locked_until,
  id
)
WHERE status = 'processing';

-- =====================================================
-- ACCEPT SHOT + DURABLE ENQUEUE
--
-- The existing production shot RPC remains the canonical
-- validation/persistence authority.
--
-- Calling it here does NOT create a second transaction.
-- PL/pgSQL function nesting remains inside the caller's
-- current PostgreSQL transaction.
--
-- Therefore:
--
--   shot command insert
--   +
--   execution enqueue
--
-- commit or roll back together.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_accept_shot_command_with_execution_atomic(
    p_combat_state_id uuid,
    p_shooter_account_id uuid,
    p_shooter_session_id uuid,
    p_turn_number integer,
    p_command_id uuid,
    p_angle_deg numeric,
    p_power numeric
  )
RETURNS public.cing_artillery_shot_commands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_command
    public.cing_artillery_shot_commands%ROWTYPE;

  v_execution
    public.cing_artillery_shot_executions%ROWTYPE;
BEGIN
  SELECT *
  INTO v_command
  FROM public.cing_artillery_accept_shot_command_atomic(
    p_combat_state_id,
    p_shooter_account_id,
    p_shooter_session_id,
    p_turn_number,
    p_command_id,
    p_angle_deg,
    p_power
  );

  IF v_command.id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_COMMAND_MISSING';
  END IF;

  INSERT INTO
    public.cing_artillery_shot_executions (
      id,
      shot_command_id,
      combat_state_id,
      turn_state_id,
      match_runtime_id,
      match_id,
      turn_number,
      status,
      attempt_count
    )
  VALUES (
    gen_random_uuid(),
    v_command.id,
    v_command.combat_state_id,
    v_command.turn_state_id,
    v_command.match_runtime_id,
    v_command.match_id,
    v_command.turn_number,
    'pending',
    0
  )
  ON CONFLICT (shot_command_id)
  DO NOTHING;

  SELECT e.*
  INTO v_execution
  FROM public.cing_artillery_shot_executions AS e
  WHERE e.shot_command_id =
    v_command.id;

  IF NOT FOUND
     OR v_execution.combat_state_id <>
        v_command.combat_state_id
     OR v_execution.turn_state_id <>
        v_command.turn_state_id
     OR v_execution.match_runtime_id <>
        v_command.match_runtime_id
     OR v_execution.match_id <>
        v_command.match_id
     OR v_execution.turn_number <>
        v_command.turn_number
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_INCONSISTENT';
  END IF;

  RETURN v_command;
END;
$$;

-- =====================================================
-- ATOMIC CLAIM
--
-- Multiple backend instances may call this concurrently.
-- PostgreSQL SKIP LOCKED is the correctness authority.
--
-- claim_token changes on every successful claim and acts
-- as a fencing token.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_claim_shot_executions_atomic(
    p_limit integer,
    p_lease_ms integer
  )
RETURNS SETOF public.cing_artillery_shot_executions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_limit IS NULL
     OR p_limit <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_CLAIM_LIMIT_INVALID';
  END IF;

  IF p_lease_ms IS NULL
     OR p_lease_ms <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_LEASE_INVALID';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT e.id
    FROM public.cing_artillery_shot_executions AS e
    WHERE e.status =
      'pending'
    ORDER BY
      e.created_at ASC,
      e.id ASC
    LIMIT p_limit
    FOR UPDATE
    SKIP LOCKED
  )
  UPDATE public.cing_artillery_shot_executions AS e
  SET
    status =
      'processing',

    attempt_count =
      e.attempt_count + 1,

    /*
     * gen_random_uuid() is evaluated for each updated
     * execution row. Every claim therefore receives its
     * own fencing identity, even inside a batch claim.
     */
    claim_token =
      gen_random_uuid(),

    claimed_at =
      clock_timestamp(),

    locked_until =
      clock_timestamp()
      +
      (
        p_lease_ms::double precision
        * interval '1 millisecond'
      ),

    updated_at =
      clock_timestamp()
  FROM candidates AS c
  WHERE e.id =
    c.id
  RETURNING e.*;
END;
$$;

-- =====================================================
-- ATOMIC COMPLETION
--
-- claim_token is mandatory fencing authority.
--
-- A successful completion retains claim_token so an ACK
-- retry from the same claimant is idempotent.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_complete_shot_execution_atomic(
    p_execution_id uuid,
    p_claim_token uuid
  )
RETURNS public.cing_artillery_shot_executions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_execution
    public.cing_artillery_shot_executions%ROWTYPE;

  v_now timestamptz;
BEGIN
  IF p_execution_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_ID_REQUIRED';
  END IF;

  IF p_claim_token IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_CLAIM_TOKEN_REQUIRED';
  END IF;

  SELECT e.*
  INTO v_execution
  FROM public.cing_artillery_shot_executions AS e
  WHERE e.id =
    p_execution_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_NOT_FOUND';
  END IF;

  IF v_execution.claim_token <>
       p_claim_token
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_CLAIM_CONFLICT';
  END IF;

  IF v_execution.status =
       'completed'
  THEN
    RETURN v_execution;
  END IF;

  IF v_execution.status <>
       'processing'
     OR v_execution.locked_until IS NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_NOT_PROCESSING';
  END IF;

  v_now :=
    clock_timestamp();

  IF v_now >=
       v_execution.locked_until
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_LEASE_EXPIRED';
  END IF;

  UPDATE public.cing_artillery_shot_executions
  SET
    status =
      'completed',

    locked_until =
      NULL,

    last_error =
      NULL,

    completed_at =
      v_now,

    updated_at =
      v_now
  WHERE id =
    v_execution.id
  RETURNING *
  INTO v_execution;

  RETURN v_execution;
END;
$$;

-- =====================================================
-- EXPLICIT RELEASE
--
-- Only the current claimant may release processing work.
--
-- Completed execution remains completed and may be
-- returned idempotently to the same claimant.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_release_shot_execution_atomic(
    p_execution_id uuid,
    p_claim_token uuid,
    p_last_error text
  )
RETURNS public.cing_artillery_shot_executions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_execution
    public.cing_artillery_shot_executions%ROWTYPE;
BEGIN
  IF p_execution_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_ID_REQUIRED';
  END IF;

  IF p_claim_token IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_CLAIM_TOKEN_REQUIRED';
  END IF;

  SELECT e.*
  INTO v_execution
  FROM public.cing_artillery_shot_executions AS e
  WHERE e.id =
    p_execution_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_NOT_FOUND';
  END IF;

  IF v_execution.claim_token <>
       p_claim_token
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_CLAIM_CONFLICT';
  END IF;

  IF v_execution.status =
       'completed'
  THEN
    RETURN v_execution;
  END IF;

  IF v_execution.status <>
       'processing'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_NOT_PROCESSING';
  END IF;

  UPDATE public.cing_artillery_shot_executions
  SET
    status =
      'pending',

    claim_token =
      NULL,

    claimed_at =
      NULL,

    locked_until =
      NULL,

    last_error =
      NULLIF(
        COALESCE(
          p_last_error,
          ''
        ),
        ''
      ),

    updated_at =
      clock_timestamp()
  WHERE id =
    v_execution.id
  RETURNING *
  INTO v_execution;

  RETURN v_execution;
END;
$$;

-- =====================================================
-- EXPIRED LEASE RECOVERY
--
-- Recovery itself is also SKIP LOCKED so multiple servers
-- can safely perform maintenance concurrently.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_release_expired_shot_executions_atomic(
    p_limit integer
  )
RETURNS SETOF public.cing_artillery_shot_executions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_limit IS NULL
     OR p_limit <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_RELEASE_LIMIT_INVALID';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT e.id
    FROM public.cing_artillery_shot_executions AS e
    WHERE e.status =
      'processing'
      AND e.locked_until IS NOT NULL
      AND e.locked_until <=
        clock_timestamp()
    ORDER BY
      e.locked_until ASC,
      e.id ASC
    LIMIT p_limit
    FOR UPDATE
    SKIP LOCKED
  )
  UPDATE public.cing_artillery_shot_executions AS e
  SET
    status =
      'pending',

    claim_token =
      NULL,

    claimed_at =
      NULL,

    locked_until =
      NULL,

    last_error =
      'CING_ARTILLERY_SHOT_EXECUTION_LEASE_EXPIRED',

    updated_at =
      clock_timestamp()
  FROM candidates AS c
  WHERE e.id =
    c.id
  RETURNING e.*;
END;
$$;

-- =====================================================
-- PRIVATE RPC ACLS
-- =====================================================

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_with_execution_atomic(
    uuid, uuid, uuid, integer, uuid, numeric, numeric
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_with_execution_atomic(
    uuid, uuid, uuid, integer, uuid, numeric, numeric
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_accept_shot_command_with_execution_atomic(
    uuid, uuid, uuid, integer, uuid, numeric, numeric
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_accept_shot_command_with_execution_atomic(
    uuid, uuid, uuid, integer, uuid, numeric, numeric
  )
TO service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_claim_shot_executions_atomic(
    integer, integer
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_claim_shot_executions_atomic(
    integer, integer
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_claim_shot_executions_atomic(
    integer, integer
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_claim_shot_executions_atomic(
    integer, integer
  )
TO service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_complete_shot_execution_atomic(
    uuid, uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_complete_shot_execution_atomic(
    uuid, uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_complete_shot_execution_atomic(
    uuid, uuid
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_complete_shot_execution_atomic(
    uuid, uuid
  )
TO service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_release_shot_execution_atomic(
    uuid, uuid, text
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_release_shot_execution_atomic(
    uuid, uuid, text
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_release_shot_execution_atomic(
    uuid, uuid, text
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_release_shot_execution_atomic(
    uuid, uuid, text
  )
TO service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_release_expired_shot_executions_atomic(
    integer
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_release_expired_shot_executions_atomic(
    integer
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_release_expired_shot_executions_atomic(
    integer
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_release_expired_shot_executions_atomic(
    integer
  )
TO service_role;

COMMIT;
