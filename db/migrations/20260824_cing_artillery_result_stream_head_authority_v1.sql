BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- AUTHORIZED RESULT STREAM HEAD READ AUTHORITY V1
--
-- Purpose:
--
--   expose the current durable result-stream head for one
--   exact match/runtime after durable participant
--   authorization.
--
-- Intended consumer:
--
--   room-scoped realtime live-result projector bootstrap.
--
-- This is NOT:
--
--   gameplay authority
--   reconnect cursor persistence
--   acknowledgement persistence
--   result payload authority
--   Socket.IO authority
--
-- PostgreSQL remains final gameplay authority.
--
-- result_sequence is PostgreSQL bigint and crosses the
-- application boundary only as canonical base-10 text.
--
-- Empty stream semantics:
--
--   "0"
--
-- The canonical result payload remains exclusively owned by:
--
--   public.cing_artillery_shot_resolutions
--
-- and is read through:
--
--   public.cing_artillery_read_result_stream_authorized_v1
--
-- This function intentionally does not join result payloads.
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.cing_artillery_read_result_stream_head_authorized_v1(
    p_match_id uuid,
    p_match_runtime_id uuid,
    p_account_id uuid
  )
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_runtime
    public.cing_artillery_match_runtimes%ROWTYPE;

  v_result_sequence bigint;
BEGIN
  -- ===================================================
  -- REQUIRED DURABLE IDENTITY
  -- ===================================================

  IF p_match_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESULT_HEAD_MATCH_ID_REQUIRED_V1';
  END IF;

  IF p_match_runtime_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESULT_HEAD_RUNTIME_ID_REQUIRED_V1';
  END IF;

  IF p_account_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESULT_HEAD_ACCOUNT_ID_REQUIRED_V1';
  END IF;


  -- ===================================================
  -- DURABLE PARTICIPANT AUTHORITY
  --
  -- Exact match/runtime/account membership comes from the
  -- immutable durable runtime snapshot.
  --
  -- Socket room membership, socket.data, client cursor,
  -- player labels and transport state are never authority.
  --
  -- Like the canonical result-stream reader, this DB read
  -- intentionally does not consult the global gameplay
  -- feature gate. Public realtime exposure owns that gate.
  -- ===================================================

  SELECT
    r.*
  INTO
    v_runtime
  FROM
    public.cing_artillery_match_runtimes AS r
  WHERE
    r.id = p_match_runtime_id
    AND r.match_id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_RESULT_HEAD_RUNTIME_NOT_FOUND_V1';
  END IF;

  IF p_account_id IS DISTINCT FROM
       v_runtime.player_one_account_id
     AND
     p_account_id IS DISTINCT FROM
       v_runtime.player_two_account_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '42501',
        MESSAGE =
          'CING_ARTILLERY_RESULT_HEAD_ACCESS_DENIED_V1';
  END IF;


  -- ===================================================
  -- CURRENT DURABLE STREAM HEAD
  --
  -- The existing V1 runtime/sequence index supports:
  --
  --   WHERE match_runtime_id = ?
  --   ORDER BY result_sequence DESC
  --   LIMIT 1
  --
  -- match_id remains part of the predicate so the stream
  -- identity is explicitly scoped to the same exact
  -- match/runtime pair already authorized above.
  --
  -- No result payload is read here.
  -- ===================================================

  SELECT
    s.result_sequence
  INTO
    v_result_sequence
  FROM
    public.cing_artillery_result_stream AS s
  WHERE
    s.match_runtime_id =
      p_match_runtime_id
    AND s.match_id =
      p_match_id
  ORDER BY
    s.result_sequence DESC
  LIMIT
    1;

  RETURN
    COALESCE(
      v_result_sequence,
      0::bigint
    )::text;
END;
$$;


-- =====================================================
-- SERVER-ONLY READ AUTHORITY
-- =====================================================

REVOKE ALL
ON FUNCTION
  public.cing_artillery_read_result_stream_head_authorized_v1(
    uuid,
    uuid,
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_read_result_stream_head_authorized_v1(
    uuid,
    uuid,
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_read_result_stream_head_authorized_v1(
    uuid,
    uuid,
    uuid
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_read_result_stream_head_authorized_v1(
    uuid,
    uuid,
    uuid
  )
FROM service_role;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_read_result_stream_head_authorized_v1(
    uuid,
    uuid,
    uuid
  )
TO service_role;


-- =====================================================
-- EXPLICIT NON-AUTHORITY
--
-- This migration introduces no:
--
--   gameplay mutation
--   result-stream mutation
--   sequence mutation
--   shot-resolution payload read
--   Socket.IO transport
--   LISTEN / NOTIFY / pg_notify
--   acknowledgement persistence
--   cursor persistence
--   gameplay feature-gate mutation
-- =====================================================

COMMIT;
