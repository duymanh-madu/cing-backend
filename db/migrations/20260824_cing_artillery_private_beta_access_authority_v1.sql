BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- PRIVATE BETA ACCESS AUTHORITY V1
--
-- Purpose:
--
--   Allow selected durable customer identities to access
--   Cing Piu Piu while the global gameplay gate remains OFF.
--
-- Canonical identity:
--
--   user_id = customers.id
--
-- This intentionally does NOT depend on
-- cing_artillery_accounts because private-beta authorization
-- must exist before first artillery onboarding/account creation.
--
-- Release behavior:
--
--   private memberships are temporary access records only.
--   Revoking/disabling/expiring them removes all beta access.
--   They grant no gameplay stat, reward, rank or economy benefit.
--
-- PostgreSQL remains durable authority.
-- =====================================================


CREATE TABLE IF NOT EXISTS
  public.cing_artillery_private_beta_access (
    user_id uuid PRIMARY KEY,

    enabled boolean NOT NULL
      DEFAULT true,

    starts_at timestamptz,

    ends_at timestamptz,

    revoked_at timestamptz,

    note text,

    created_at timestamptz NOT NULL
      DEFAULT now(),

    updated_at timestamptz NOT NULL
      DEFAULT now(),

    CONSTRAINT
      cing_artillery_private_beta_access_window_check
      CHECK (
        ends_at IS NULL
        OR starts_at IS NULL
        OR ends_at > starts_at
      )
  );


ALTER TABLE
  public.cing_artillery_private_beta_access
ENABLE ROW LEVEL SECURITY;


REVOKE ALL
ON TABLE
  public.cing_artillery_private_beta_access
FROM PUBLIC;

REVOKE ALL
ON TABLE
  public.cing_artillery_private_beta_access
FROM anon;

REVOKE ALL
ON TABLE
  public.cing_artillery_private_beta_access
FROM authenticated;

REVOKE ALL
ON TABLE
  public.cing_artillery_private_beta_access
FROM service_role;


/*
 * Narrow read authority.
 *
 * No phone numbers are stored here.
 * Caller supplies canonical customers.id / artillery user_id.
 *
 * Active means:
 *
 *   enabled = true
 *   revoked_at IS NULL
 *   starts_at is null or reached
 *   ends_at is null or not reached
 */

CREATE OR REPLACE FUNCTION
  public.cing_artillery_has_private_beta_access_v1(
    p_user_id uuid
  )
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    EXISTS (
      SELECT
        1
      FROM
        public.cing_artillery_private_beta_access AS b
      WHERE
        b.user_id = p_user_id
        AND b.enabled = true
        AND b.revoked_at IS NULL
        AND (
          b.starts_at IS NULL
          OR b.starts_at <= now()
        )
        AND (
          b.ends_at IS NULL
          OR b.ends_at > now()
        )
    )
  INTO
    v_allowed;

  RETURN COALESCE(
    v_allowed,
    false
  );
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_has_private_beta_access_v1(
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_has_private_beta_access_v1(
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_has_private_beta_access_v1(
    uuid
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_has_private_beta_access_v1(
    uuid
  )
FROM service_role;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_has_private_beta_access_v1(
    uuid
  )
TO service_role;


/*
 * Narrow mutation authority.
 *
 * This is intentionally separate from global gameplay enable.
 * It mutates only one tester membership row.
 *
 * Provisioning must resolve phone -> durable customers.id
 * outside this authority. Phone numbers never become beta
 * authorization keys.
 */

CREATE OR REPLACE FUNCTION
  public.cing_artillery_set_private_beta_access_v1(
    p_user_id uuid,
    p_enabled boolean,
    p_starts_at timestamptz,
    p_ends_at timestamptz,
    p_note text
  )
RETURNS public.cing_artillery_private_beta_access
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row
    public.cing_artillery_private_beta_access%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_PRIVATE_BETA_USER_ID_REQUIRED';
  END IF;

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_PRIVATE_BETA_ENABLED_REQUIRED';
  END IF;

  IF
    p_starts_at IS NOT NULL
    AND p_ends_at IS NOT NULL
    AND p_ends_at <= p_starts_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_PRIVATE_BETA_WINDOW_INVALID';
  END IF;

  INSERT INTO
    public.cing_artillery_private_beta_access (
      user_id,
      enabled,
      starts_at,
      ends_at,
      revoked_at,
      note,
      created_at,
      updated_at
    )
  VALUES (
    p_user_id,
    p_enabled,
    p_starts_at,
    p_ends_at,
    CASE
      WHEN p_enabled
        THEN NULL
      ELSE now()
    END,
    NULLIF(
      btrim(
        COALESCE(
          p_note,
          ''
        )
      ),
      ''
    ),
    now(),
    now()
  )
  ON CONFLICT (
    user_id
  )
  DO UPDATE
  SET
    enabled =
      EXCLUDED.enabled,

    starts_at =
      EXCLUDED.starts_at,

    ends_at =
      EXCLUDED.ends_at,

    revoked_at =
      CASE
        WHEN EXCLUDED.enabled
          THEN NULL
        ELSE now()
      END,

    note =
      EXCLUDED.note,

    updated_at =
      now()
  RETURNING
    *
  INTO
    v_row;

  RETURN
    v_row;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_private_beta_access_v1(
    uuid,
    boolean,
    timestamptz,
    timestamptz,
    text
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_private_beta_access_v1(
    uuid,
    boolean,
    timestamptz,
    timestamptz,
    text
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_private_beta_access_v1(
    uuid,
    boolean,
    timestamptz,
    timestamptz,
    text
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_private_beta_access_v1(
    uuid,
    boolean,
    timestamptz,
    timestamptz,
    text
  )
FROM service_role;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_set_private_beta_access_v1(
    uuid,
    boolean,
    timestamptz,
    timestamptz,
    text
  )
TO service_role;


COMMENT ON TABLE
  public.cing_artillery_private_beta_access
IS
  'Temporary Cing Piu Piu private-beta access keyed only by canonical customers.id/user_id. Grants no gameplay stats, economy or rewards.';

COMMENT ON FUNCTION
  public.cing_artillery_has_private_beta_access_v1(
    uuid
  )
IS
  'Server-only read authority for active Cing Piu Piu private-beta membership.';

COMMENT ON FUNCTION
  public.cing_artillery_set_private_beta_access_v1(
    uuid,
    boolean,
    timestamptz,
    timestamptz,
    text
  )
IS
  'Server-only provisioning/revocation authority for temporary Cing Piu Piu private-beta membership.';


COMMIT;
