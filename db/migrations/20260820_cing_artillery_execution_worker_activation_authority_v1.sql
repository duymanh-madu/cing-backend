BEGIN;

-- =====================================================
-- CING ARTILLERY — EXECUTION WORKER ACTIVATION AUTHORITY V1
--
-- Purpose:
--
--   Separate authoritative execution-worker activation
--   from the global Cing Artillery gameplay feature gate.
--
-- Global gameplay gate:
--
--   cing_artillery_config.enabled
--
-- Execution worker gate:
--
--   cing_artillery_config.execution_worker
--
-- The execution worker gate defaults OFF.
--
-- This migration does NOT:
--
--   enable Cing Artillery
--   enable the execution worker
--   expose routes or realtime
--   mutate gameplay state
--   claim executions during migration
--
-- PostgreSQL claim authority itself checks this gate before
-- acquiring pending work. Turning the gate OFF therefore
-- prevents new claims while allowing already-claimed work
-- to finish or enter normal lease recovery.
-- =====================================================


-- =====================================================
-- VERSIONED EXECUTION WORKER CONFIG
-- =====================================================

UPDATE public.app_configs
SET cing_artillery_config =
  jsonb_set(
    cing_artillery_config,
    '{execution_worker}',
    jsonb_build_object(
      'version',
      1,
      'enabled',
      false
    ),
    true
  )
WHERE id = 1
  AND NOT (
    cing_artillery_config
      ? 'execution_worker'
  );


-- =====================================================
-- APPLY-TIME VALIDATION
--
-- Existing configuration is never silently repaired when
-- execution_worker already exists.
--
-- Unknown/malformed versions or fields fail atomically.
-- =====================================================

DO $$
DECLARE
  v_config jsonb;
  v_worker jsonb;
  v_version_text text;
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
          'CING_ARTILLERY_EXECUTION_WORKER_CONFIG_INVALID';
  END IF;

  v_worker :=
    v_config -> 'execution_worker';

  IF v_worker IS NULL
     OR jsonb_typeof(v_worker) <> 'object'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_WORKER_CONFIG_INVALID';
  END IF;

  IF NOT (
       v_worker ? 'version'
       AND v_worker ? 'enabled'
     )
     OR (
       SELECT count(*)
       FROM jsonb_object_keys(v_worker)
     ) <> 2
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_WORKER_CONFIG_INVALID';
  END IF;

  IF jsonb_typeof(
       v_worker -> 'version'
     ) <> 'number'
     OR jsonb_typeof(
       v_worker -> 'enabled'
     ) <> 'boolean'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_WORKER_CONFIG_INVALID';
  END IF;

  v_version_text :=
    COALESCE(
      v_worker ->> 'version',
      ''
    );

  IF v_version_text !~ '^[1-9][0-9]*$'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_WORKER_CONFIG_INVALID';
  END IF;

  IF v_version_text::numeric <>
       1::numeric
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_WORKER_VERSION_UNSUPPORTED';
  END IF;
END;
$$;


-- =====================================================
-- PRIVATE EXECUTION WORKER GATE READER
--
-- No application role receives EXECUTE.
--
-- The SECURITY DEFINER claim authority calls this function
-- as its owning PostgreSQL role.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_execution_worker_enabled_private_v1()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_config jsonb;
  v_worker jsonb;
  v_version_text text;
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
          'CING_ARTILLERY_EXECUTION_WORKER_CONFIG_INVALID';
  END IF;

  v_worker :=
    v_config -> 'execution_worker';

  IF v_worker IS NULL
     OR jsonb_typeof(v_worker) <> 'object'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_WORKER_CONFIG_INVALID';
  END IF;

  IF NOT (
       v_worker ? 'version'
       AND v_worker ? 'enabled'
     )
     OR (
       SELECT count(*)
       FROM jsonb_object_keys(v_worker)
     ) <> 2
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_WORKER_CONFIG_INVALID';
  END IF;

  IF jsonb_typeof(
       v_worker -> 'version'
     ) <> 'number'
     OR jsonb_typeof(
       v_worker -> 'enabled'
     ) <> 'boolean'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_WORKER_CONFIG_INVALID';
  END IF;

  v_version_text :=
    COALESCE(
      v_worker ->> 'version',
      ''
    );

  IF v_version_text !~ '^[1-9][0-9]*$'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_WORKER_CONFIG_INVALID';
  END IF;

  IF v_version_text::numeric <>
       1::numeric
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_WORKER_VERSION_UNSUPPORTED';
  END IF;

  RETURN (
    v_worker ->> 'enabled'
  )::boolean;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_execution_worker_enabled_private_v1()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_execution_worker_enabled_private_v1()
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_execution_worker_enabled_private_v1()
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_execution_worker_enabled_private_v1()
FROM service_role;


-- =====================================================
-- CLAIM AUTHORITY V3
--
-- New claim is allowed only when execution_worker.enabled
-- is explicitly true.
--
-- Existing retry/quarantine semantics from authority V2
-- remain unchanged.
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

  IF NOT public
       .cing_artillery_execution_worker_enabled_private_v1()
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_WORKER_DISABLED';
  END IF;

  v_max_attempts :=
    public
      .cing_artillery_execution_max_attempts_private_v1();

  v_now :=
    clock_timestamp();

  /*
   * Runtime execution policy remains mutable.
   *
   * Pending rows already at or above max_attempts are
   * quarantined before selecting claimable work.
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


-- Existing EXECUTE ACL of the CREATE OR REPLACE claim RPC
-- is preserved. No new application-role privilege is granted.

COMMIT;
