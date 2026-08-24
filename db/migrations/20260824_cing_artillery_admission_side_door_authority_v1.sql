BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- ADMISSION SIDE-DOOR AUTHORITY V1
--
-- Purpose:
--
-- Close direct service-role writes that can create durable
-- gameplay admission state outside PostgreSQL effective-
-- access authority.
--
-- Covered here:
--
--   1. artillery account get-or-create
--   2. gameplay-session get-or-create
--
-- Effective gameplay access remains:
--
--   global gameplay enabled
--      OR
--   active private-beta membership
--
-- Not covered here:
--
--   onboarding rewrite
--   matchmaking rewrite
--   combat/runtime/world/turn rewrite
--   shot acceptance rewrite
--   character/loadout mutation hardening
--   worker/finalization/cleanup
--
-- No global gameplay state is changed.
-- No tester is provisioned.
-- No economy/reward/rank state is touched.
-- =====================================================


-- =====================================================
-- ACCOUNT ADMISSION AUTHORITY
--
-- Replaces application-side direct INSERT into
-- cing_artillery_accounts.
--
-- Canonical identity is TEXT customers.id / user_id.
--
-- Concurrency:
--   UNIQUE(user_id) remains final identity fence.
--
-- Existing accounts are returned unchanged.
-- New accounts are created active.
-- =====================================================

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


-- =====================================================
-- GAMEPLAY SESSION ADMISSION AUTHORITY
--
-- Replaces application-side direct INSERT into
-- cing_artillery_gameplay_sessions.
--
-- Lock order:
--
--   canonical account FOR UPDATE
--        ->
--   existing active session lookup
--        ->
--   active session INSERT
--
-- The account lock serializes concurrent session creation
-- for one account before the partial UNIQUE(active) fence.
--
-- Existing active session is returned idempotently.
-- =====================================================

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


-- =====================================================
-- CLOSE DIRECT ACCOUNT TABLE MUTATION SIDE DOOR
--
-- SECURITY DEFINER onboarding/account authorities remain
-- able to mutate using owner privileges.
--
-- service_role becomes explicit SELECT-only.
-- =====================================================

ALTER TABLE
  public.cing_artillery_accounts
ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE
  public.cing_artillery_accounts
FROM PUBLIC;

REVOKE ALL
ON TABLE
  public.cing_artillery_accounts
FROM anon;

REVOKE ALL
ON TABLE
  public.cing_artillery_accounts
FROM authenticated;

REVOKE ALL
ON TABLE
  public.cing_artillery_accounts
FROM service_role;

GRANT SELECT
ON TABLE
  public.cing_artillery_accounts
TO service_role;


-- =====================================================
-- CLOSE DIRECT GAMEPLAY-SESSION MUTATION SIDE DOOR
--
-- End-session SECURITY DEFINER authority remains capable
-- of lifecycle cleanup.
--
-- service_role becomes explicit SELECT-only.
-- =====================================================

ALTER TABLE
  public.cing_artillery_gameplay_sessions
ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE
  public.cing_artillery_gameplay_sessions
FROM PUBLIC;

REVOKE ALL
ON TABLE
  public.cing_artillery_gameplay_sessions
FROM anon;

REVOKE ALL
ON TABLE
  public.cing_artillery_gameplay_sessions
FROM authenticated;

REVOKE ALL
ON TABLE
  public.cing_artillery_gameplay_sessions
FROM service_role;

GRANT SELECT
ON TABLE
  public.cing_artillery_gameplay_sessions
TO service_role;


COMMENT ON FUNCTION
  public.cing_artillery_get_or_create_account_authorized_v1(
    text
  )
IS
  'Server-only effective-access-authorized Cing Piu Piu account get-or-create authority.';


COMMENT ON FUNCTION
  public.cing_artillery_get_or_create_gameplay_session_authorized_v1(
    uuid
  )
IS
  'Server-only effective-access-authorized Cing Piu Piu active gameplay-session get-or-create authority.';


COMMIT;
