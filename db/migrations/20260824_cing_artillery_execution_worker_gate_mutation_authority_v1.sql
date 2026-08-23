BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- EXECUTION WORKER GATE MUTATION AUTHORITY V1
--
-- Purpose:
--
--   provide one narrow durable authority for changing only:
--
--     app_configs
--       .cing_artillery_config
--       .execution_worker
--       .enabled
--
-- This authority does NOT:
--
--   change the root gameplay gate
--   change execution_worker.version
--   change execution policy
--   change rules
--   change starter config
--   publish or enable maps
--   start any process
--   claim any execution
--   mutate gameplay state
--
-- Deployment activation remains a separate Mắt Bão
-- environment-level authority.
--
-- PostgreSQL remains the durable claim-admission authority.
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.cing_artillery_set_execution_worker_enabled_atomic(
    p_enabled boolean
  )
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_config jsonb;
  v_worker jsonb;

  v_next_config jsonb;
  v_next_worker jsonb;

  v_updated_config jsonb;
  v_updated_worker jsonb;

  v_root_key_count integer;
  v_worker_key_count integer;
BEGIN
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_WORKER_ENABLED_STATE_REQUIRED';
  END IF;

  /*
   * Serialize all Cing Artillery config mutations through
   * the canonical app_configs row.
   *
   * This prevents a nested worker-gate update from overwriting
   * a concurrent root or sibling configuration mutation.
   */
  SELECT
    cing_artillery_config
  INTO
    v_config
  FROM
    public.app_configs
  WHERE
    id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_CONFIG_NOT_FOUND';
  END IF;

  /*
   * Exact root V1 contract.
   *
   * Unknown or missing root keys fail closed.
   */
  IF v_config IS NULL
     OR jsonb_typeof(v_config) <> 'object'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_CONFIG_INVALID';
  END IF;

  SELECT
    count(*)::integer
  INTO
    v_root_key_count
  FROM
    jsonb_object_keys(v_config);

  IF v_root_key_count <> 6
     OR NOT (
       v_config ? 'version'
       AND v_config ? 'enabled'
       AND v_config ? 'rules'
       AND v_config ? 'starter'
       AND v_config ? 'execution_policy'
       AND v_config ? 'execution_worker'
     )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_CONFIG_INVALID';
  END IF;

  IF jsonb_typeof(
       v_config -> 'version'
     ) <> 'number'
     OR jsonb_typeof(
          v_config -> 'enabled'
        ) <> 'boolean'
     OR jsonb_typeof(
          v_config -> 'rules'
        ) <> 'object'
     OR jsonb_typeof(
          v_config -> 'starter'
        ) <> 'object'
     OR jsonb_typeof(
          v_config -> 'execution_policy'
        ) <> 'object'
     OR jsonb_typeof(
          v_config -> 'execution_worker'
        ) <> 'object'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_CONFIG_INVALID';
  END IF;

  BEGIN
    IF (v_config ->> 'version')::integer <> 1
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_CONFIG_INVALID';
    END IF;
  EXCEPTION
    WHEN invalid_text_representation
      OR numeric_value_out_of_range
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_CONFIG_INVALID';
  END;

  /*
   * Nested execution-worker contract is exact V1:
   *
   *   version
   *   enabled
   *
   * No unknown nested fields are silently preserved because
   * they indicate a schema revision this V1 authority does not
   * understand.
   */
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

  SELECT
    count(*)::integer
  INTO
    v_worker_key_count
  FROM
    jsonb_object_keys(v_worker);

  IF v_worker_key_count <> 2
     OR NOT (
       v_worker ? 'version'
       AND v_worker ? 'enabled'
     )
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

  BEGIN
    IF (v_worker ->> 'version')::integer <> 1
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_EXECUTION_WORKER_VERSION_UNSUPPORTED';
    END IF;
  EXCEPTION
    WHEN invalid_text_representation
      OR numeric_value_out_of_range
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_EXECUTION_WORKER_CONFIG_INVALID';
  END;

  /*
   * Build exactly one nested-field mutation.
   *
   * create_missing=false is deliberate: V1 never manufactures
   * missing worker configuration.
   */
  v_next_config :=
    jsonb_set(
      v_config,
      '{execution_worker,enabled}',
      to_jsonb(p_enabled),
      false
    );

  v_next_worker :=
    v_next_config -> 'execution_worker';

  /*
   * Root sibling preservation:
   *
   * execution_worker is the only root object this authority
   * may touch.
   */
  IF
    (v_next_config - 'execution_worker')
    <>
    (v_config - 'execution_worker')
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_WORKER_GATE_PRESERVATION_FAILED';
  END IF;

  /*
   * Nested sibling preservation:
   *
   * enabled is the only execution_worker member allowed to
   * change. version must remain byte-for-byte JSON-equivalent.
   */
  IF
    (v_next_worker - 'enabled')
    <>
    (v_worker - 'enabled')
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_WORKER_GATE_PRESERVATION_FAILED';
  END IF;

  IF
    (v_worker ->> 'enabled')::boolean =
    p_enabled
  THEN
    RETURN v_config;
  END IF;

  UPDATE
    public.app_configs
  SET
    cing_artillery_config =
      v_next_config
  WHERE
    id = 1
  RETURNING
    cing_artillery_config
  INTO
    v_updated_config;

  v_updated_worker :=
    v_updated_config -> 'execution_worker';

  IF v_updated_config IS NULL
     OR jsonb_typeof(
          v_updated_config
        ) <> 'object'
     OR v_updated_worker IS NULL
     OR jsonb_typeof(
          v_updated_worker
        ) <> 'object'
     OR
       (
         v_updated_worker
         ->> 'enabled'
       )::boolean
       IS DISTINCT FROM
       p_enabled
     OR
       (
         v_updated_config
         - 'execution_worker'
       )
       <>
       (
         v_config
         - 'execution_worker'
       )
     OR
       (
         v_updated_worker
         - 'enabled'
       )
       <>
       (
         v_worker
         - 'enabled'
       )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXECUTION_WORKER_GATE_PERSISTENCE_INCONSISTENT';
  END IF;

  RETURN
    v_updated_config;
END;
$$;


-- =====================================================
-- PRIVATE SERVER-SIDE AUTHORITY ONLY
-- =====================================================

REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_execution_worker_enabled_atomic(
    boolean
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_execution_worker_enabled_atomic(
    boolean
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_execution_worker_enabled_atomic(
    boolean
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_execution_worker_enabled_atomic(
    boolean
  )
FROM service_role;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_set_execution_worker_enabled_atomic(
    boolean
  )
TO service_role;


COMMIT;
