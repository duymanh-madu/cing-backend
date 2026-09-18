BEGIN;

CREATE TABLE IF NOT EXISTS public.cing_device_reauth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  /*
   * Intentionally text:
   * customers.id physical DB type is not owned/proven by this repository.
   * Backend customerRepository remains the canonical customer authority.
   */
  customer_id text NOT NULL,

  binding_id text NOT NULL,

  /*
   * Credential = dr1.<selector>.<secret>
   *
   * selector is a non-secret lookup key.
   * secret is NEVER persisted.
   * Only SHA-256(secret) is persisted.
   */
  token_selector text NOT NULL,
  token_hash text NOT NULL,

  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cing_device_reauth_sessions_customer_id_ck
    CHECK (length(btrim(customer_id)) > 0),

  CONSTRAINT cing_device_reauth_sessions_binding_id_ck
    CHECK (length(btrim(binding_id)) >= 16),

  CONSTRAINT cing_device_reauth_sessions_selector_ck
    CHECK (token_selector ~ '^[0-9a-f]{32}$'),

  CONSTRAINT cing_device_reauth_sessions_hash_ck
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),

  CONSTRAINT cing_device_reauth_sessions_expiry_ck
    CHECK (expires_at > created_at),

  CONSTRAINT cing_device_reauth_sessions_customer_binding_uq
    UNIQUE (customer_id, binding_id),

  CONSTRAINT cing_device_reauth_sessions_selector_uq
    UNIQUE (token_selector)
);

CREATE INDEX IF NOT EXISTS
  cing_device_reauth_sessions_active_expiry_idx
ON public.cing_device_reauth_sessions (
  expires_at
)
WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS
  cing_device_reauth_sessions_customer_idx
ON public.cing_device_reauth_sessions (
  customer_id
);

ALTER TABLE public.cing_device_reauth_sessions
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE public.cing_device_reauth_sessions
FROM PUBLIC;

REVOKE ALL
ON TABLE public.cing_device_reauth_sessions
FROM anon;

REVOKE ALL
ON TABLE public.cing_device_reauth_sessions
FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.cing_device_reauth_sessions
TO service_role;

COMMIT;

/*
 * =====================================================
 * DEVICE REAUTH — ATOMIC CONSUME + ROTATE
 * =====================================================
 *
 * The presented generation can succeed exactly once.
 *
 * Caller already hashes the presented secret.
 * PostgreSQL never receives or stores plaintext secret.
 *
 * Row lock serializes concurrent recovery attempts.
 * On success the selector/hash pair is replaced atomically.
 */

CREATE OR REPLACE FUNCTION
public.cing_device_reauth_consume_rotate_v1(
  p_current_selector text,
  p_current_token_hash text,
  p_binding_id text,
  p_next_selector text,
  p_next_token_hash text,
  p_next_expires_at timestamptz
)
RETURNS TABLE (
  session_id uuid,
  customer_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.cing_device_reauth_sessions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF
    p_current_selector IS NULL OR
    p_current_selector !~ '^[0-9a-f]{32}$' OR
    p_current_token_hash IS NULL OR
    p_current_token_hash !~ '^[0-9a-f]{64}$' OR
    p_binding_id IS NULL OR
    length(btrim(p_binding_id)) < 16 OR
    p_next_selector IS NULL OR
    p_next_selector !~ '^[0-9a-f]{32}$' OR
    p_next_token_hash IS NULL OR
    p_next_token_hash !~ '^[0-9a-f]{64}$' OR
    p_next_expires_at IS NULL OR
    p_next_expires_at <= v_now
  THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_row
  FROM public.cing_device_reauth_sessions
  WHERE token_selector = p_current_selector
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF
    v_row.revoked_at IS NOT NULL OR
    v_row.expires_at <= v_now OR
    v_row.binding_id <> btrim(p_binding_id) OR
    v_row.token_hash <> p_current_token_hash
  THEN
    RETURN;
  END IF;

  UPDATE public.cing_device_reauth_sessions
  SET
    token_selector = p_next_selector,
    token_hash = p_next_token_hash,
    expires_at = p_next_expires_at,
    last_used_at = v_now,
    updated_at = v_now
  WHERE id = v_row.id;

  RETURN QUERY
  SELECT
    v_row.id,
    v_row.customer_id;
END;
$$;

REVOKE ALL ON FUNCTION
public.cing_device_reauth_consume_rotate_v1(
  text,
  text,
  text,
  text,
  text,
  timestamptz
)
FROM PUBLIC;

REVOKE ALL ON FUNCTION
public.cing_device_reauth_consume_rotate_v1(
  text,
  text,
  text,
  text,
  text,
  timestamptz
)
FROM anon;

REVOKE ALL ON FUNCTION
public.cing_device_reauth_consume_rotate_v1(
  text,
  text,
  text,
  text,
  text,
  timestamptz
)
FROM authenticated;

GRANT EXECUTE ON FUNCTION
public.cing_device_reauth_consume_rotate_v1(
  text,
  text,
  text,
  text,
  text,
  timestamptz
)
TO service_role;
