BEGIN;

-- =====================================================
-- CING ARTILLERY — GAMEPLAY SESSION LIFECYCLE AUTHORITY
--
-- Atomic terminal transition:
--   active -> completed
--   active -> abandoned
--
-- Guarantees:
--   account ownership
--   row-level serialization
--   idempotent same-state retry
--   conflicting terminal transition rejection
--
-- No public exposure.
-- PostgreSQL remains the final lifecycle authority.
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_end_gameplay_session_atomic(
    p_account_id uuid,
    p_session_id uuid,
    p_status text
  )
RETURNS TABLE (
  id uuid,
  account_id uuid,
  status text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text :=
    lower(
      btrim(
        COALESCE(
          p_status,
          ''
        )
      )
    );

  v_session
    public.cing_artillery_gameplay_sessions%ROWTYPE;
BEGIN
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE = 'CING_ARTILLERY_GAMEPLAY_SESSION_ACCOUNT_REQUIRED';
  END IF;

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE = 'CING_ARTILLERY_GAMEPLAY_SESSION_ID_REQUIRED';
  END IF;

  IF v_status NOT IN (
    'completed',
    'abandoned'
  ) THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE = 'CING_ARTILLERY_INVALID_GAMEPLAY_SESSION_TERMINAL_STATUS';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id = p_session_id
    AND s.account_id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE = 'CING_ARTILLERY_GAMEPLAY_SESSION_NOT_FOUND';
  END IF;

  -- Idempotent retry of the exact same terminal transition.
  IF v_session.status = v_status THEN
    RETURN QUERY
    SELECT
      v_session.id,
      v_session.account_id,
      v_session.status,
      v_session.started_at,
      v_session.ended_at,
      v_session.created_at,
      v_session.updated_at;

    RETURN;
  END IF;

  -- A terminal session cannot be rewritten to another terminal state.
  IF v_session.status <> 'active' THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE = 'CING_ARTILLERY_GAMEPLAY_SESSION_STATE_CONFLICT';
  END IF;

  UPDATE public.cing_artillery_gameplay_sessions AS s
  SET
    status = v_status,
    ended_at = now(),
    updated_at = now()
  WHERE s.id = v_session.id
    AND s.account_id = v_session.account_id
  RETURNING s.*
  INTO v_session;

  RETURN QUERY
  SELECT
    v_session.id,
    v_session.account_id,
    v_session.status,
    v_session.started_at,
    v_session.ended_at,
    v_session.created_at,
    v_session.updated_at;
END;
$$;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_end_gameplay_session_atomic(
    uuid,
    uuid,
    text
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_end_gameplay_session_atomic(
    uuid,
    uuid,
    text
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_end_gameplay_session_atomic(
    uuid,
    uuid,
    text
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_end_gameplay_session_atomic(
    uuid,
    uuid,
    text
  )
TO service_role;

COMMIT;
