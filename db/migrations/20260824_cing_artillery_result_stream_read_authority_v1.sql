BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- AUTHORIZED DURABLE RESULT STREAM READ AUTHORITY V1
--
-- Purpose:
--
--   expose one server-only, participant-authorized,
--   monotonically ordered read authority for:
--
--     live durable result projection
--     reconnect / resume catch-up
--
-- PostgreSQL remains final gameplay authority.
--
-- This function is READ ONLY with respect to gameplay
-- state. It performs no durable mutation.
--
-- Cursor transport:
--
--   result_sequence is PostgreSQL bigint.
--
--   Both input and output cursors cross the application
--   boundary as canonical base-10 text so JavaScript
--   Number precision can never become cursor authority.
--
-- Canonical gameplay payload remains owned exclusively by:
--
--   public.cing_artillery_shot_resolutions
--
-- The result stream owns only durable ordering/identity.
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.cing_artillery_read_result_stream_authorized_v1(
    p_match_id uuid,
    p_match_runtime_id uuid,
    p_account_id uuid,
    p_after_sequence text,
    p_limit integer
  )
RETURNS TABLE (
  result_sequence text,

  resolution_id uuid,
  execution_id uuid,
  shot_command_id uuid,
  combat_state_id uuid,
  turn_state_id uuid,
  match_runtime_id uuid,
  match_id uuid,
  turn_number integer,

  physics_version integer,
  outcome text,

  impact_exact_version integer,
  impact_physics_fixed_scale text,

  impact_start_x_scaled text,
  impact_start_y_scaled text,
  impact_delta_x_scaled text,
  impact_delta_y_scaled text,

  impact_contact_kind text,
  impact_contact_numerator text,
  impact_contact_denominator text,
  impact_contact_a text,
  impact_contact_b text,
  impact_contact_discriminant text,

  impact_projection_version integer,
  impact_x text,
  impact_y text,

  target_account_id uuid,
  damage text,

  resolved_at timestamptz,
  resolution_created_at timestamptz,
  stream_created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_runtime
    public.cing_artillery_match_runtimes%ROWTYPE;

  v_after_sequence bigint;
BEGIN
  -- ===================================================
  -- REQUIRED DURABLE IDENTITY
  -- ===================================================

  IF p_match_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESULT_READ_MATCH_ID_REQUIRED_V1';
  END IF;

  IF p_match_runtime_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESULT_READ_RUNTIME_ID_REQUIRED_V1';
  END IF;

  IF p_account_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESULT_READ_ACCOUNT_ID_REQUIRED_V1';
  END IF;


  -- ===================================================
  -- CANONICAL TEXT CURSOR
  --
  -- Accepted:
  --
  --   0
  --   positive canonical base-10 integer
  --
  -- Rejected:
  --
  --   NULL
  --   empty
  --   sign
  --   leading zeroes
  --   decimals
  --   exponent notation
  --   whitespace-surrounded non-canonical representation
  --
  -- btrim is used only to detect surrounding whitespace;
  -- the original representation must equal the trimmed
  -- representation.
  -- ===================================================

  IF p_after_sequence IS NULL
     OR p_after_sequence = ''
     OR p_after_sequence <> btrim(
          p_after_sequence
        )
     OR p_after_sequence !~
          '^(0|[1-9][0-9]*)$'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESULT_READ_CURSOR_INVALID_V1';
  END IF;

  BEGIN
    v_after_sequence :=
      p_after_sequence::bigint;

  EXCEPTION
    WHEN numeric_value_out_of_range THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_RESULT_READ_CURSOR_OUT_OF_RANGE_V1';
  END;


  -- ===================================================
  -- BOUNDED READ
  --
  -- A single RPC call can never request an unbounded
  -- durable stream scan.
  -- ===================================================

  IF p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 100
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESULT_READ_LIMIT_INVALID_V1';
  END IF;


  -- ===================================================
  -- DURABLE PARTICIPANT AUTHORITY
  --
  -- The caller cannot establish participation through:
  --
  --   socket room membership
  --   socket.data
  --   cursor ownership
  --   client supplied player slot
  --
  -- Exact match/runtime/account membership comes from the
  -- immutable durable runtime snapshot.
  --
  -- This read authority intentionally does NOT consult the
  -- global gameplay feature gate. Public exposure belongs
  -- to the authenticated realtime boundary, while durable
  -- result recovery must remain possible independently of
  -- transport activation state.
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
          'CING_ARTILLERY_RESULT_READ_RUNTIME_NOT_FOUND_V1';
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
          'CING_ARTILLERY_RESULT_READ_ACCESS_DENIED_V1';
  END IF;


  -- ===================================================
  -- STREAM / RESOLUTION IDENTITY INTEGRITY
  --
  -- Migration 58 creates stream rows from the canonical
  -- resolution INSERT in the same PostgreSQL transaction.
  --
  -- Before returning anything, fail closed if a candidate
  -- stream row no longer agrees with its canonical
  -- resolution identity.
  --
  -- Scope remains bounded to the same first p_limit rows
  -- that this read would otherwise expose.
  -- ===================================================

  IF EXISTS (
    WITH candidate AS (
      SELECT
        s.*
      FROM
        public.cing_artillery_result_stream AS s
      WHERE
        s.match_id = p_match_id
        AND s.match_runtime_id =
          p_match_runtime_id
        AND s.result_sequence >
          v_after_sequence
      ORDER BY
        s.result_sequence ASC
      LIMIT
        p_limit
    )
    SELECT
      1
    FROM
      candidate AS s
    LEFT JOIN
      public.cing_artillery_shot_resolutions AS r
        ON r.id = s.resolution_id
    WHERE
      r.id IS NULL

      OR r.execution_id IS DISTINCT FROM
           s.execution_id

      OR r.shot_command_id IS DISTINCT FROM
           s.shot_command_id

      OR r.combat_state_id IS DISTINCT FROM
           s.combat_state_id

      OR r.turn_state_id IS DISTINCT FROM
           s.turn_state_id

      OR r.match_runtime_id IS DISTINCT FROM
           s.match_runtime_id

      OR r.match_id IS DISTINCT FROM
           s.match_id

      OR r.turn_number IS DISTINCT FROM
           s.turn_number
  ) THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESULT_STREAM_IDENTITY_INCONSISTENT_V1';
  END IF;


  -- ===================================================
  -- CANONICAL ORDERED RESULT READ
  --
  -- All PostgreSQL bigint/numeric gameplay scalars which
  -- may exceed JavaScript safe integer precision cross the
  -- transport boundary as canonical text.
  --
  -- Integer semantic/version fields remain integer because
  -- their domain is already bounded by their contracts.
  -- ===================================================

  RETURN QUERY
  SELECT
    s.result_sequence::text,

    r.id,
    r.execution_id,
    r.shot_command_id,
    r.combat_state_id,
    r.turn_state_id,
    r.match_runtime_id,
    r.match_id,
    r.turn_number,

    r.physics_version,
    r.outcome,

    r.impact_exact_version,
    r.impact_physics_fixed_scale::text,

    r.impact_start_x_scaled::text,
    r.impact_start_y_scaled::text,
    r.impact_delta_x_scaled::text,
    r.impact_delta_y_scaled::text,

    r.impact_contact_kind,
    r.impact_contact_numerator::text,
    r.impact_contact_denominator::text,
    r.impact_contact_a::text,
    r.impact_contact_b::text,
    r.impact_contact_discriminant::text,

    r.impact_projection_version,
    r.impact_x::text,
    r.impact_y::text,

    r.target_account_id,
    r.damage::text,

    r.resolved_at,
    r.created_at,
    s.created_at

  FROM
    public.cing_artillery_result_stream AS s

  JOIN
    public.cing_artillery_shot_resolutions AS r
      ON r.id = s.resolution_id
      AND r.execution_id =
        s.execution_id
      AND r.shot_command_id =
        s.shot_command_id
      AND r.combat_state_id =
        s.combat_state_id
      AND r.turn_state_id =
        s.turn_state_id
      AND r.match_runtime_id =
        s.match_runtime_id
      AND r.match_id =
        s.match_id
      AND r.turn_number =
        s.turn_number

  WHERE
    s.match_id = p_match_id
    AND s.match_runtime_id =
      p_match_runtime_id
    AND s.result_sequence >
      v_after_sequence

  ORDER BY
    s.result_sequence ASC

  LIMIT
    p_limit;
END;
$$;


-- =====================================================
-- SERVER-ONLY EXECUTION AUTHORITY
-- =====================================================

REVOKE ALL
ON FUNCTION
  public.cing_artillery_read_result_stream_authorized_v1(
    uuid,
    uuid,
    uuid,
    text,
    integer
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_read_result_stream_authorized_v1(
    uuid,
    uuid,
    uuid,
    text,
    integer
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_read_result_stream_authorized_v1(
    uuid,
    uuid,
    uuid,
    text,
    integer
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_read_result_stream_authorized_v1(
    uuid,
    uuid,
    uuid,
    text,
    integer
  )
FROM service_role;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_read_result_stream_authorized_v1(
    uuid,
    uuid,
    uuid,
    text,
    integer
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
--   Socket.IO transport
--   NOTIFY / pg_notify
--   acknowledgement persistence
--   cursor persistence
--   gameplay feature-gate mutation
--
-- Client cursor state is only a read position.
-- It is never gameplay authority.
-- =====================================================

COMMIT;
