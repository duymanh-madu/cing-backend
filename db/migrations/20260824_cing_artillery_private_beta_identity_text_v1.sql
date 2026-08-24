BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- PRIVATE BETA CANONICAL IDENTITY TYPE CORRECTION V1
--
-- Canonical Cing Artillery user identity is TEXT:
--
--   cing_artillery_accounts.user_id text
--   onboarding p_user_id text
--   realtime authenticated customer.id -> String(...)
--
-- Migration 61 introduced beta user_id as uuid before this
-- canonical cross-layer type was re-attested.
--
-- This migration corrects only the private-beta identity
-- storage and RPC signatures.
--
-- It does NOT:
--   enable gameplay
--   provision testers
--   change rewards/economy/rank
--   alter artillery account identity
--   alter gameplay state
-- =====================================================


/*
 * Remove UUID-signature beta RPCs before changing the
 * underlying membership identity column.
 *
 * They have no durable gameplay ownership.
 */

DROP FUNCTION IF EXISTS
  public.cing_artillery_has_private_beta_access_v1(
    uuid
  );

DROP FUNCTION IF EXISTS
  public.cing_artillery_set_private_beta_access_v1(
    uuid,
    boolean,
    timestamptz,
    timestamptz,
    text
  );


ALTER TABLE
  public.cing_artillery_private_beta_access
ALTER COLUMN
  user_id
TYPE text
USING
  user_id::text;


ALTER TABLE
  public.cing_artillery_private_beta_access
DROP CONSTRAINT IF EXISTS
  cing_artillery_private_beta_access_user_id_nonempty_check;

ALTER TABLE
  public.cing_artillery_private_beta_access
ADD CONSTRAINT
  cing_artillery_private_beta_access_user_id_nonempty_check
CHECK (
  btrim(user_id) <> ''
);


/*
 * Canonical server-only beta membership read.
 */

CREATE OR REPLACE FUNCTION
  public.cing_artillery_has_private_beta_access_v1(
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

  v_allowed boolean;
BEGIN
  IF v_user_id = '' THEN
    RETURN false;
  END IF;

  SELECT
    EXISTS (
      SELECT
        1
      FROM
        public.cing_artillery_private_beta_access AS b
      WHERE
        b.user_id =
          v_user_id
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
    text
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_has_private_beta_access_v1(
    text
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_has_private_beta_access_v1(
    text
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_has_private_beta_access_v1(
    text
  )
FROM service_role;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_has_private_beta_access_v1(
    text
  )
TO service_role;


/*
 * Canonical server-only provisioning / revocation.
 */

CREATE OR REPLACE FUNCTION
  public.cing_artillery_set_private_beta_access_v1(
    p_user_id text,
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
  v_user_id text :=
    btrim(
      COALESCE(
        p_user_id,
        ''
      )
    );

  v_row
    public.cing_artillery_private_beta_access%ROWTYPE;
BEGIN
  IF v_user_id = '' THEN
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
    v_user_id,
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
    text,
    boolean,
    timestamptz,
    timestamptz,
    text
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_private_beta_access_v1(
    text,
    boolean,
    timestamptz,
    timestamptz,
    text
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_private_beta_access_v1(
    text,
    boolean,
    timestamptz,
    timestamptz,
    text
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_set_private_beta_access_v1(
    text,
    boolean,
    timestamptz,
    timestamptz,
    text
  )
FROM service_role;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_set_private_beta_access_v1(
    text,
    boolean,
    timestamptz,
    timestamptz,
    text
  )
TO service_role;


COMMENT ON COLUMN
  public.cing_artillery_private_beta_access.user_id
IS
  'Canonical Cing Artillery user identity; same text contract as cing_artillery_accounts.user_id.';


COMMIT;
