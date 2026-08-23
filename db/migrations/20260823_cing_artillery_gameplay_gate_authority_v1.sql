BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- ROOT GAMEPLAY GATE MUTATION AUTHORITY V1
--
-- Purpose:
--
--   provide one narrow durable authority for changing only:
--
--     app_configs.cing_artillery_config.enabled
--
-- This function MUST preserve every sibling configuration
-- value exactly as stored.
--
-- It does NOT:
--
--   enable/disable the execution worker
--   mutate execution policy
--   mutate gameplay rules
--   mutate starter configuration
--   publish/enable maps
--   create gameplay state
--   expose any public transport
--
-- PostgreSQL is the final durable authority.
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.cing_artillery_set_gameplay_enabled_atomic(
    p_enabled boolean
  )
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_config jsonb;
  v_next_config jsonb;
  v_root_key_count integer;
  v_updated_config jsonb;
BEGIN
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_GAMEPLAY_ENABLED_STATE_REQUIRED';
  END IF;

  /*
   * Serialize all root Cing Artillery gameplay-gate mutations
   * through the canonical app_configs row.
   *
   * Locking before validation also prevents this authority
   * from overwriting a concurrent nested-config mutation.
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
   * Root contract is deliberately exact for V1.
   *
   * Current durable root keys:
   *
   *   version
   *   enabled
   *   rules
   *   starter
   *   execution_policy
   *   execution_worker
   *
   * Unknown/missing root keys fail closed. A future config
   * schema revision must deliberately revise this authority.
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

  /*
   * V1 root configuration must remain version 1.
   *
   * Parse only after JSON type validation so malformed JSON
   * fails through the canonical configuration error instead
   * of leaking cast semantics.
   */
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
   * Nested authorities remain separate concerns.
   *
   * This gate writer verifies only that their durable roots
   * are structurally present and versioned; it never rewrites
   * their contents.
   */
  IF NOT (
       (v_config -> 'rules') ? 'version'
       AND
       (v_config -> 'starter') ? 'version'
       AND
       (v_config -> 'execution_policy') ? 'version'
       AND
       (v_config -> 'execution_worker') ? 'version'
     )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_CONFIG_INVALID';
  END IF;

  /*
   * Mutation authority:
   *
   * jsonb_set changes exactly one root field and does not
   * reconstruct the configuration from application defaults.
   */
  v_next_config :=
    jsonb_set(
      v_config,
      '{enabled}',
      to_jsonb(p_enabled),
      false
    );

  /*
   * Strong sibling-preservation invariant.
   */
  IF
    (v_next_config - 'enabled')
    <>
    (v_config - 'enabled')
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_GAMEPLAY_GATE_PRESERVATION_FAILED';
  END IF;

  /*
   * Idempotent confirmation:
   *
   * no durable write is necessary if the requested state is
   * already canonical.
   */
  IF
    (v_config ->> 'enabled')::boolean =
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

  IF v_updated_config IS NULL
     OR jsonb_typeof(
          v_updated_config
        ) <> 'object'
     OR
       (
         v_updated_config
         ->> 'enabled'
       )::boolean
       IS DISTINCT FROM
       p_enabled
     OR
       (
         v_updated_config
         - 'enabled'
       )
       <>
       (
         v_config
         - 'enabled'
       )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_GAMEPLAY_GATE_PERSISTENCE_INCONSISTENT';
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
  public.cing_artillery_set_gameplay_enabled_atomic(
    boolean
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_gameplay_enabled_atomic(
    boolean
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_gameplay_enabled_atomic(
    boolean
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_gameplay_enabled_atomic(
    boolean
  )
FROM service_role;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_set_gameplay_enabled_atomic(
    boolean
  )
TO service_role;


COMMIT;
