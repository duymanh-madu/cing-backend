BEGIN;

-- =====================================================
-- CING ARTILLERY — EXECUTION RETRY / QUARANTINE AUTHORITY V1
--
-- Durable execution lifecycle becomes:
--
--   pending
--     -> processing
--       -> completed
--       -> pending       (retryable failure, attempts remain)
--       -> quarantined   (terminal failure OR attempts exhausted)
--
-- PostgreSQL owns:
--
--   retry attempt ceiling
--   quarantine transition
--   fencing validation
--   expired-lease retry/quarantine decision
--
-- Runtime owns only failure classification:
--
--   retryable
--   terminal
--
-- No gameplay result, HP, turn, match or realtime mutation
-- occurs in this authority.
-- =====================================================


-- =====================================================
-- VERSIONED EXECUTION POLICY
--
-- Policy is mutable production configuration.
-- It is deliberately NOT hardcoded in application code.
--
-- max_attempts counts successful claims because claim authority
-- increments attempt_count exactly once per claim.
--
-- Five attempts is the initial production policy and can later
-- be changed through the canonical configuration authority
-- without changing worker/source behavior.
-- =====================================================

UPDATE public.app_configs
SET cing_artillery_config =
  jsonb_set(
    cing_artillery_config,
    '{execution_policy}',
    jsonb_build_object(
      'version',
      1,
      'max_attempts',
      5
    ),
    true
  )
WHERE id = 1
  AND NOT (
    cing_artillery_config
      ? 'execution_policy'
  );


-- =====================================================
-- CURRENT EXECUTION POLICY APPLY-TIME VALIDATION
--
-- Existing production configuration must never be silently
-- accepted merely because execution_policy already exists.
--
-- Migration fails atomically if current policy is malformed
-- or unsupported.
-- =====================================================

DO $$
DECLARE
  v_config jsonb;
  v_policy jsonb;
  v_version_text text;
  v_max_attempts_text text;
BEGIN
  SELECT
    cing_artillery_config
  INTO
    v_config
  FROM public.app_configs
  WHERE id = 1;

  IF NOT FOUND
     OR v_config IS NULL
     OR jsonb_typeof(v_config) <> 'object'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_POLICY_CONFIG_INVALID';
  END IF;

  v_policy :=
    v_config -> 'execution_policy';

  IF v_policy IS NULL
     OR jsonb_typeof(v_policy) <> 'object'
     OR jsonb_typeof(
          v_policy -> 'version'
        ) <> 'number'
     OR jsonb_typeof(
          v_policy -> 'max_attempts'
        ) <> 'number'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_POLICY_CONFIG_INVALID';
  END IF;

  v_version_text :=
    COALESCE(
      v_policy ->> 'version',
      ''
    );

  IF v_version_text !~ '^[1-9][0-9]*$'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_POLICY_CONFIG_INVALID';
  END IF;

  IF v_version_text::numeric <>
       1::numeric
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_POLICY_VERSION_UNSUPPORTED';
  END IF;

  v_max_attempts_text :=
    COALESCE(
      v_policy ->> 'max_attempts',
      ''
    );

  IF v_max_attempts_text !~ '^[1-9][0-9]*$'
     OR v_max_attempts_text::numeric >
        2147483647::numeric
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_POLICY_MAX_ATTEMPTS_INVALID';
  END IF;
END;
$$;


-- =====================================================
-- DURABLE FAILURE METADATA
-- =====================================================

ALTER TABLE
  public.cing_artillery_shot_executions
ADD COLUMN IF NOT EXISTS
  last_failure_code text,
ADD COLUMN IF NOT EXISTS
  quarantined_at timestamptz;


ALTER TABLE
  public.cing_artillery_shot_executions
DROP CONSTRAINT IF EXISTS
  cing_artillery_shot_executions_status_check;

ALTER TABLE
  public.cing_artillery_shot_executions
ADD CONSTRAINT
  cing_artillery_shot_executions_status_check
CHECK (
  status IN (
    'pending',
    'processing',
    'completed',
    'quarantined'
  )
);


ALTER TABLE
  public.cing_artillery_shot_executions
DROP CONSTRAINT IF EXISTS
  cing_artillery_shot_executions_lifecycle_check;

ALTER TABLE
  public.cing_artillery_shot_executions
ADD CONSTRAINT
  cing_artillery_shot_executions_lifecycle_check
CHECK (
  (
    status = 'pending'
    AND claim_token IS NULL
    AND claimed_at IS NULL
    AND locked_until IS NULL
    AND completed_at IS NULL
    AND quarantined_at IS NULL
  )
  OR
  (
    status = 'processing'
    AND claim_token IS NOT NULL
    AND claimed_at IS NOT NULL
    AND locked_until IS NOT NULL
    AND locked_until > claimed_at
    AND completed_at IS NULL
    AND quarantined_at IS NULL
  )
  OR
  (
    status = 'completed'
    AND claim_token IS NOT NULL
    AND claimed_at IS NOT NULL
    AND locked_until IS NULL
    AND completed_at IS NOT NULL
    AND completed_at >= claimed_at
    AND quarantined_at IS NULL
  )
  OR
  (
    status = 'quarantined'
    AND locked_until IS NULL
    AND completed_at IS NULL
    AND quarantined_at IS NOT NULL
    AND last_failure_code IS NOT NULL
    AND btrim(last_failure_code) <> ''
    AND (
      (
        claim_token IS NOT NULL
        AND claimed_at IS NOT NULL
        AND quarantined_at >= claimed_at
      )
      OR
      (
        claim_token IS NULL
        AND claimed_at IS NULL
      )
    )
  )
);


ALTER TABLE
  public.cing_artillery_shot_executions
DROP CONSTRAINT IF EXISTS
  cing_artillery_shot_executions_last_failure_code_check;

ALTER TABLE
  public.cing_artillery_shot_executions
ADD CONSTRAINT
  cing_artillery_shot_executions_last_failure_code_check
CHECK (
  last_failure_code IS NULL
  OR (
    btrim(last_failure_code) <> ''
    AND char_length(last_failure_code) <= 160
  )
);


CREATE INDEX IF NOT EXISTS
  cing_artillery_shot_executions_quarantined_idx
ON public.cing_artillery_shot_executions (
  quarantined_at DESC,
  id
)
WHERE status = 'quarantined';


-- =====================================================
-- LEGACY EXHAUSTED-PENDING NORMALIZATION
--
-- Before this migration, retry release authority could return
-- a claimed execution to pending without a retry ceiling.
--
-- A historical pending row may therefore already have consumed
-- the new configured retry budget.
--
-- Such rows must not become permanently unclaimable zombies.
-- They are quarantined durably during migration.
--
-- Pending rows have already discarded their claim token and
-- claimed_at under the legacy lifecycle, so this normalization
-- deliberately preserves those fields as NULL.
-- =====================================================

WITH policy AS (
  SELECT
    (
      cing_artillery_config
        -> 'execution_policy'
        ->> 'max_attempts'
    )::integer AS max_attempts
  FROM public.app_configs
  WHERE id = 1
)
UPDATE public.cing_artillery_shot_executions AS e
SET
  status =
    'quarantined',

  last_failure_code =
    'CING_ARTILLERY_SHOT_EXECUTION_RETRY_BUDGET_EXHAUSTED',

  last_error =
    COALESCE(
      e.last_error,
      'CING_ARTILLERY_SHOT_EXECUTION_RETRY_BUDGET_EXHAUSTED'
    ),

  quarantined_at =
    clock_timestamp(),

  updated_at =
    clock_timestamp()
FROM policy AS p
WHERE e.status =
    'pending'
  AND e.attempt_count >=
    p.max_attempts;


-- =====================================================
-- PRIVATE POLICY VALIDATOR
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_execution_max_attempts_private_v1()
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_config jsonb;
  v_policy jsonb;
  v_value text;
  v_max_attempts integer;
BEGIN
  SELECT
    cing_artillery_config
  INTO
    v_config
  FROM public.app_configs
  WHERE id = 1;

  IF NOT FOUND
     OR v_config IS NULL
     OR jsonb_typeof(v_config) <> 'object'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_POLICY_CONFIG_INVALID';
  END IF;

  v_policy :=
    v_config -> 'execution_policy';

  IF v_policy IS NULL
     OR jsonb_typeof(v_policy) <> 'object'
     OR jsonb_typeof(
          v_policy -> 'version'
        ) <> 'number'
     OR jsonb_typeof(
          v_policy -> 'max_attempts'
        ) <> 'number'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_POLICY_CONFIG_INVALID';
  END IF;

  IF COALESCE(
       v_policy ->> 'version',
       ''
     ) !~ '^[1-9][0-9]*$'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_POLICY_CONFIG_INVALID';
  END IF;

  IF (
       v_policy ->> 'version'
     )::numeric <>
       1::numeric
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_POLICY_VERSION_UNSUPPORTED';
  END IF;

  v_value :=
    COALESCE(
      v_policy ->> 'max_attempts',
      ''
    );

  IF v_value !~ '^[1-9][0-9]*$'
     OR v_value::numeric >
        2147483647::numeric
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_POLICY_MAX_ATTEMPTS_INVALID';
  END IF;

  v_max_attempts :=
    v_value::integer;

  RETURN v_max_attempts;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_execution_max_attempts_private_v1()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_execution_max_attempts_private_v1()
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_execution_max_attempts_private_v1()
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_execution_max_attempts_private_v1()
FROM service_role;


-- =====================================================
-- CLAIM AUTHORITY V2
--
-- Pending work that has already exhausted the configured
-- claim budget is never claimable again.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_claim_shot_executions_atomic(
    p_limit integer,
    p_lease_ms integer
  )
RETURNS SETOF public.cing_artillery_shot_executions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_max_attempts integer;
  v_now timestamptz;
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

  v_max_attempts :=
    public
      .cing_artillery_execution_max_attempts_private_v1();

  v_now :=
    clock_timestamp();

  /*
   * Runtime policy is mutable.
   *
   * If max_attempts is lowered after this migration, existing
   * pending executions may already be at or above the new
   * ceiling.
   *
   * Quarantine a bounded batch before claiming new work so
   * such rows can never become permanently unclaimable pending
   * zombies.
   *
   * These rows are pending, therefore legacy lifecycle has
   * already cleared claim_token / claimed_at. Preserve that
   * historical truth rather than inventing fencing provenance.
   */
  WITH exhausted AS (
    SELECT e.id
    FROM public.cing_artillery_shot_executions AS e
    WHERE e.status =
      'pending'
      AND e.attempt_count >=
        v_max_attempts
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
      'quarantined',

    last_failure_code =
      'CING_ARTILLERY_SHOT_EXECUTION_RETRY_BUDGET_EXHAUSTED',

    last_error =
      COALESCE(
        e.last_error,
        'CING_ARTILLERY_SHOT_EXECUTION_RETRY_BUDGET_EXHAUSTED'
      ),

    quarantined_at =
      v_now,

    updated_at =
      v_now
  FROM exhausted AS x
  WHERE e.id =
    x.id;

  RETURN QUERY
  WITH candidates AS (
    SELECT e.id
    FROM public.cing_artillery_shot_executions AS e
    WHERE e.status =
      'pending'
      AND e.attempt_count <
        v_max_attempts
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
-- FAILURE RESOLUTION AUTHORITY
--
-- p_failure_class:
--
--   retryable
--   terminal
--
-- Retryable failure:
--
--   attempt_count < max_attempts -> pending
--   attempt_count >= max_attempts -> quarantined
--
-- Terminal failure:
--
--   -> quarantined immediately
--
-- Current claim token is mandatory and fenced.
-- Completed execution returns idempotently.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_resolve_shot_execution_failure_atomic(
    p_execution_id uuid,
    p_claim_token uuid,
    p_failure_class text,
    p_failure_code text,
    p_last_error text
  )
RETURNS public.cing_artillery_shot_executions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_execution
    public.cing_artillery_shot_executions%ROWTYPE;

  v_failure_class text;
  v_failure_code text;
  v_last_error text;

  v_max_attempts integer;
  v_quarantine boolean;
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

  v_failure_class :=
    lower(
      btrim(
        COALESCE(
          p_failure_class,
          ''
        )
      )
    );

  IF v_failure_class NOT IN (
    'retryable',
    'terminal'
  ) THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_FAILURE_CLASS_INVALID';
  END IF;

  v_failure_code :=
    btrim(
      COALESCE(
        p_failure_code,
        ''
      )
    );

  IF v_failure_code = ''
     OR char_length(v_failure_code) > 160
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_FAILURE_CODE_INVALID';
  END IF;

  v_last_error :=
    NULLIF(
      btrim(
        COALESCE(
          p_last_error,
          ''
        )
      ),
      ''
    );

  IF v_last_error IS NOT NULL
     AND char_length(v_last_error) > 2000
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_SHOT_EXECUTION_LAST_ERROR_INVALID';
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

  IF v_execution.claim_token IS DISTINCT FROM
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

  IF v_execution.status =
       'quarantined'
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

  v_max_attempts :=
    public
      .cing_artillery_execution_max_attempts_private_v1();

  v_quarantine :=
    v_failure_class =
      'terminal'
    OR
    v_execution.attempt_count >=
      v_max_attempts;

  v_now :=
    clock_timestamp();

  IF v_quarantine THEN
    UPDATE public.cing_artillery_shot_executions
    SET
      status =
        'quarantined',

      locked_until =
        NULL,

      last_failure_code =
        v_failure_code,

      last_error =
        v_last_error,

      quarantined_at =
        v_now,

      updated_at =
        v_now
    WHERE id =
      v_execution.id
    RETURNING *
    INTO v_execution;
  ELSE
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

      last_failure_code =
        v_failure_code,

      last_error =
        v_last_error,

      quarantined_at =
        NULL,

      updated_at =
        v_now
    WHERE id =
      v_execution.id
    RETURNING *
    INTO v_execution;
  END IF;

  RETURN v_execution;
END;
$$;


-- =====================================================
-- EXPIRED LEASE RECOVERY V2
--
-- Expired executions below max attempts return to pending.
--
-- Expired executions whose last claim consumed the retry
-- budget are quarantined and cannot loop forever.
--
-- For backward compatibility with the existing recovery
-- worker, this function returns ONLY rows restored to pending.
-- Quarantined rows are still mutated durably but are not
-- returned to the legacy normalizer that does not yet know
-- the quarantined status.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_release_expired_shot_executions_atomic(
    p_limit integer
  )
RETURNS SETOF public.cing_artillery_shot_executions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_max_attempts integer;
  v_now timestamptz;
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

  v_max_attempts :=
    public
      .cing_artillery_execution_max_attempts_private_v1();

  v_now :=
    clock_timestamp();

  RETURN QUERY
  WITH candidates AS (
    SELECT e.id
    FROM public.cing_artillery_shot_executions AS e
    WHERE e.status =
      'processing'
      AND e.locked_until IS NOT NULL
      AND e.locked_until <=
        v_now
    ORDER BY
      e.locked_until ASC,
      e.id ASC
    LIMIT p_limit
    FOR UPDATE
    SKIP LOCKED
  ),
  recovered AS (
    UPDATE public.cing_artillery_shot_executions AS e
    SET
      status =
        CASE
          WHEN e.attempt_count >=
                 v_max_attempts
          THEN 'quarantined'
          ELSE 'pending'
        END,

      claim_token =
        CASE
          WHEN e.attempt_count >=
                 v_max_attempts
          THEN e.claim_token
          ELSE NULL
        END,

      claimed_at =
        CASE
          WHEN e.attempt_count >=
                 v_max_attempts
          THEN e.claimed_at
          ELSE NULL
        END,

      locked_until =
        NULL,

      last_failure_code =
        'CING_ARTILLERY_SHOT_EXECUTION_LEASE_EXPIRED',

      last_error =
        'CING_ARTILLERY_SHOT_EXECUTION_LEASE_EXPIRED',

      quarantined_at =
        CASE
          WHEN e.attempt_count >=
                 v_max_attempts
          THEN v_now
          ELSE NULL
        END,

      updated_at =
        v_now
    FROM candidates AS c
    WHERE e.id =
      c.id
    RETURNING e.*
  )
  SELECT r.*
  FROM recovered AS r
  WHERE r.status =
    'pending';
END;
$$;


-- =====================================================
-- LEGACY EXPLICIT RELEASE SIDE DOOR
--
-- Old release API can bypass failure classification and the
-- retry ceiling, so service_role must no longer execute it.
-- No current server caller uses this RPC.
-- =====================================================

REVOKE ALL
ON FUNCTION
  public.cing_artillery_release_shot_execution_atomic(
    uuid,
    uuid,
    text
  )
FROM service_role;


-- =====================================================
-- PRIVATE RPC ACL
-- =====================================================

REVOKE ALL
ON FUNCTION
  public.cing_artillery_claim_shot_executions_atomic(
    integer,
    integer
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_claim_shot_executions_atomic(
    integer,
    integer
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_claim_shot_executions_atomic(
    integer,
    integer
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_claim_shot_executions_atomic(
    integer,
    integer
  )
TO service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_resolve_shot_execution_failure_atomic(
    uuid,
    uuid,
    text,
    text,
    text
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_resolve_shot_execution_failure_atomic(
    uuid,
    uuid,
    text,
    text,
    text
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_resolve_shot_execution_failure_atomic(
    uuid,
    uuid,
    text,
    text,
    text
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_resolve_shot_execution_failure_atomic(
    uuid,
    uuid,
    text,
    text,
    text
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
