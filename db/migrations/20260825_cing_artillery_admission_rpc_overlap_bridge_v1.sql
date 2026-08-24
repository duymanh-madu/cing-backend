-- =====================================================
-- CING PIU PIU
-- ADDITIVE ADMISSION RPC OVERLAP BRIDGE V1
--
-- Purpose:
--
--   Establish the two migration64 authorized admission
--   RPCs before game-server cutover while preserving the
--   existing service_role direct table-write capability
--   required by the currently deployed runtime.
--
-- This migration is intentionally additive only.
--
-- It MUST NOT:
--   - enable RLS on admission tables
--   - revoke table privileges
--   - grant/rewrite table privileges
--   - mutate global gameplay state
--   - provision private-beta users
--   - change economy/reward/rank state
--
-- Full table ACL cutover remains owned exclusively by
-- migration64 after the compatible runtime is deployed.
--
-- Dependency:
--   migration63 effective gameplay access authority.
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION
  public.cing_artillery_get_or_create_account_authorized_v1(
    p_user_id text
  )
RETURNS public.cing_artillery_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id text :=
    btrim(
      COALESCE(
        p_user_id,
        ''
      )
    );

  v_account
    public.cing_artillery_accounts%ROWTYPE;
BEGIN
  IF v_user_id = '' THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_invalid_user_id';
  END IF;


  IF NOT
    public.cing_artillery_has_effective_gameplay_access_v1(
      v_user_id
    )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_disabled';
  END IF;


  INSERT INTO
    public.cing_artillery_accounts (
      id,
      user_id,
      status
    )
  VALUES (
    gen_random_uuid(),
    v_user_id,
    'active'
  )
  ON CONFLICT (
    user_id
  )
  DO NOTHING;


  SELECT
    a.*
  INTO
    v_account
  FROM
    public.cing_artillery_accounts AS a
  WHERE
    a.user_id =
      v_user_id;


  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_account_creation_failed';
  END IF;


  RETURN
    v_account;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_account_authorized_v1(
    text
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_account_authorized_v1(
    text
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_account_authorized_v1(
    text
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_account_authorized_v1(
    text
  )
FROM service_role;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_get_or_create_account_authorized_v1(
    text
  )
TO service_role;

CREATE OR REPLACE FUNCTION
  public.cing_artillery_get_or_create_gameplay_session_authorized_v1(
    p_account_id uuid
  )
RETURNS public.cing_artillery_gameplay_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_account
    public.cing_artillery_accounts%ROWTYPE;

  v_session
    public.cing_artillery_gameplay_sessions%ROWTYPE;
BEGIN
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_invalid_account_id';
  END IF;


  SELECT
    a.*
  INTO
    v_account
  FROM
    public.cing_artillery_accounts AS a
  WHERE
    a.id =
      p_account_id
  FOR UPDATE;


  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_account_not_found';
  END IF;


  IF v_account.status <> 'active' THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_account_not_active';
  END IF;


  IF NOT
    public.cing_artillery_account_has_effective_gameplay_access_private_v1(
      v_account.id
    )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_disabled';
  END IF;


  SELECT
    s.*
  INTO
    v_session
  FROM
    public.cing_artillery_gameplay_sessions AS s
  WHERE
    s.account_id =
      v_account.id
    AND s.status =
      'active';


  IF FOUND THEN
    RETURN
      v_session;
  END IF;


  INSERT INTO
    public.cing_artillery_gameplay_sessions (
      id,
      account_id,
      status
    )
  VALUES (
    gen_random_uuid(),
    v_account.id,
    'active'
  )
  RETURNING
    *
  INTO
    v_session;


  RETURN
    v_session;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_gameplay_session_authorized_v1(
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_gameplay_session_authorized_v1(
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_gameplay_session_authorized_v1(
    uuid
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_gameplay_session_authorized_v1(
    uuid
  )
FROM service_role;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_get_or_create_gameplay_session_authorized_v1(
    uuid
  )
TO service_role;

COMMIT;
