BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- EFFECTIVE GAMEPLAY ACCESS AUTHORITY V1
--
-- Effective access:
--
--   global gameplay enabled
--     OR
--   active private-beta membership
--
-- Canonical identities:
--
--   user_id    text
--   account_id uuid -> cing_artillery_accounts.user_id
--
-- This migration introduces reusable access readers only.
--
-- It does NOT:
--   enable global gameplay
--   provision testers
--   rewrite existing gameplay RPCs
--   mutate gameplay state
--   mutate economy/rewards/rank
--   expose client-controlled account identity authority
--
-- PostgreSQL remains final durable authority.
-- =====================================================


-- =====================================================
-- PRIVATE ROOT GAMEPLAY GATE READER
--
-- Preserves the existing fail-closed DB semantics:
--
--   missing config
--   malformed config
--   malformed enabled field
--
-- all raise cing_artillery_config_invalid.
--
-- No application role receives EXECUTE.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_global_gameplay_enabled_private_v1()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_config jsonb;
BEGIN
  SELECT
    cing_artillery_config
  INTO
    v_config
  FROM
    public.app_configs
  WHERE
    id = 1;

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

  RETURN
    (
      v_config ->> 'enabled'
    )::boolean;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_global_gameplay_enabled_private_v1()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_global_gameplay_enabled_private_v1()
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_global_gameplay_enabled_private_v1()
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_global_gameplay_enabled_private_v1()
FROM service_role;


-- =====================================================
-- SERVER-SIDE USER EFFECTIVE ACCESS READER
--
-- This is the application-facing access authority.
--
-- The server supplies canonical authenticated customers.id
-- using the same TEXT contract already used by Artillery
-- account/onboarding authority.
--
-- Client phone/external identity is never consulted here.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_has_effective_gameplay_access_v1(
    p_user_id text
  )
RETURNS boolean
LANGUAGE plpgsql
STABLE
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
BEGIN
  /*
   * Global launch always grants normal gameplay access.
   *
   * This branch deliberately executes before beta lookup so
   * private-beta membership becomes irrelevant after launch.
   */
  IF
    public.cing_artillery_global_gameplay_enabled_private_v1()
  THEN
    RETURN true;
  END IF;

  IF v_user_id = '' THEN
    RETURN false;
  END IF;

  RETURN
    public.cing_artillery_has_private_beta_access_v1(
      v_user_id
    );
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_has_effective_gameplay_access_v1(
    text
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_has_effective_gameplay_access_v1(
    text
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_has_effective_gameplay_access_v1(
    text
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_has_effective_gameplay_access_v1(
    text
  )
FROM service_role;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_has_effective_gameplay_access_v1(
    text
  )
TO service_role;


-- =====================================================
-- PRIVATE ACCOUNT -> USER EFFECTIVE ACCESS READER
--
-- Deep gameplay authorities commonly own canonical
-- account_id rather than authenticated user_id.
--
-- They must resolve user identity from the durable account
-- row instead of accepting user identity from callers.
--
-- No application role receives EXECUTE.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_account_has_effective_gameplay_access_private_v1(
    p_account_id uuid
  )
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id text;
BEGIN
  IF p_account_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    a.user_id
  INTO
    v_user_id
  FROM
    public.cing_artillery_accounts AS a
  WHERE
    a.id =
      p_account_id;

  IF NOT FOUND
     OR v_user_id IS NULL
     OR btrim(
          v_user_id
        ) = ''
  THEN
    RETURN false;
  END IF;

  RETURN
    public.cing_artillery_has_effective_gameplay_access_v1(
      v_user_id
    );
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_account_has_effective_gameplay_access_private_v1(
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_account_has_effective_gameplay_access_private_v1(
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_account_has_effective_gameplay_access_private_v1(
    uuid
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_account_has_effective_gameplay_access_private_v1(
    uuid
  )
FROM service_role;


-- =====================================================
-- PRIVATE CANONICAL PARTICIPANT-PAIR READER
--
-- Match/combat authorities already own two canonical
-- participant account IDs.
--
-- While global gameplay is dark, BOTH participants must
-- remain authorized private-beta users.
--
-- After global launch the user helper returns true for every
-- valid account identity, so beta records grant no lasting
-- privilege.
--
-- No application role receives EXECUTE.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_participants_have_effective_gameplay_access_private_v1(
    p_player_one_account_id uuid,
    p_player_two_account_id uuid
  )
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_player_one_account_id IS NULL
     OR p_player_two_account_id IS NULL
     OR p_player_one_account_id =
        p_player_two_account_id
  THEN
    RETURN false;
  END IF;

  RETURN
    public.cing_artillery_account_has_effective_gameplay_access_private_v1(
      p_player_one_account_id
    )
    AND
    public.cing_artillery_account_has_effective_gameplay_access_private_v1(
      p_player_two_account_id
    );
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_participants_have_effective_gameplay_access_private_v1(
    uuid,
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_participants_have_effective_gameplay_access_private_v1(
    uuid,
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_participants_have_effective_gameplay_access_private_v1(
    uuid,
    uuid
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_participants_have_effective_gameplay_access_private_v1(
    uuid,
    uuid
  )
FROM service_role;


COMMENT ON FUNCTION
  public.cing_artillery_has_effective_gameplay_access_v1(
    text
  )
IS
  'Server-only Cing Piu Piu access authority: global gameplay enabled or active private-beta membership.';


COMMENT ON FUNCTION
  public.cing_artillery_account_has_effective_gameplay_access_private_v1(
    uuid
  )
IS
  'Private canonical account-to-user effective gameplay access reader.';


COMMENT ON FUNCTION
  public.cing_artillery_participants_have_effective_gameplay_access_private_v1(
    uuid,
    uuid
  )
IS
  'Private effective gameplay access reader requiring both canonical match participants.';


COMMIT;
