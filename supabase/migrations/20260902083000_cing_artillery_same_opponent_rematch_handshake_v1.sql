BEGIN;

/*
 * Cing Piu Piu — same-opponent rematch handshake V1.
 *
 * Binding rules:
 *
 * - source match must already be canonically completed
 * - caller must be one of the two source participants
 * - first consent creates no gameplay session and no match
 * - both participants must consent independently
 * - both participants must retain effective gameplay access
 * - neither participant may already own another active session
 * - neither participant may already have a waiting ticket
 * - historical source match/session/tickets are immutable
 * - successful handshake creates:
 *     exactly two NEW gameplay sessions
 *     exactly two NEW matched tickets
 *     exactly one NEW match
 * - new match preserves the exact source opponent pair
 * - repeated calls recover the same rematch authority
 *
 * PostgreSQL is the final concurrency authority.
 */

CREATE TABLE IF NOT EXISTS
  public.cing_artillery_rematch_handshakes (
    source_match_id uuid PRIMARY KEY
      REFERENCES public.cing_artillery_matches(id)
      ON DELETE RESTRICT,

    player_one_account_id uuid NOT NULL
      REFERENCES public.cing_artillery_accounts(id)
      ON DELETE RESTRICT,

    player_two_account_id uuid NOT NULL
      REFERENCES public.cing_artillery_accounts(id)
      ON DELETE RESTRICT,

    player_one_accepted_at timestamptz,

    player_two_accepted_at timestamptz,

    status text NOT NULL
      DEFAULT 'waiting',

    rematch_match_id uuid
      REFERENCES public.cing_artillery_matches(id)
      ON DELETE RESTRICT,

    player_one_session_id uuid
      REFERENCES public.cing_artillery_gameplay_sessions(id)
      ON DELETE RESTRICT,

    player_two_session_id uuid
      REFERENCES public.cing_artillery_gameplay_sessions(id)
      ON DELETE RESTRICT,

    created_at timestamptz NOT NULL
      DEFAULT clock_timestamp(),

    matched_at timestamptz,

    updated_at timestamptz NOT NULL
      DEFAULT clock_timestamp(),

    CONSTRAINT
      cing_artillery_rematch_handshakes_distinct_accounts_chk
      CHECK (
        player_one_account_id <>
        player_two_account_id
      ),

    CONSTRAINT
      cing_artillery_rematch_handshakes_status_chk
      CHECK (
        status IN (
          'waiting',
          'matched'
        )
      ),

    CONSTRAINT
      cing_artillery_rematch_handshakes_lifecycle_chk
      CHECK (
        (
          status = 'waiting'
          AND rematch_match_id IS NULL
          AND player_one_session_id IS NULL
          AND player_two_session_id IS NULL
          AND matched_at IS NULL
        )
        OR
        (
          status = 'matched'
          AND rematch_match_id IS NOT NULL
          AND player_one_session_id IS NOT NULL
          AND player_two_session_id IS NOT NULL
          AND player_one_accepted_at IS NOT NULL
          AND player_two_accepted_at IS NOT NULL
          AND matched_at IS NOT NULL
        )
      )
  );

CREATE UNIQUE INDEX IF NOT EXISTS
  cing_artillery_rematch_handshakes_rematch_match_uidx
ON public.cing_artillery_rematch_handshakes (
  rematch_match_id
)
WHERE rematch_match_id IS NOT NULL;


/*
 * D3B was the admission primitive used to prove that rematch
 * must create new gameplay admission rather than reuse the
 * historical source session.
 *
 * D3C becomes the canonical public service-role boundary.
 * Session creation must happen only after mutual consent,
 * so the standalone D3B RPC is deliberately closed.
 */
REVOKE ALL
ON FUNCTION
  public.cing_artillery_create_rematch_gameplay_session_atomic_v1(
    uuid,
    uuid
  )
FROM service_role;


CREATE OR REPLACE FUNCTION
  public.cing_artillery_request_same_opponent_rematch_atomic_v1(
    p_source_match_id uuid,
    p_account_id uuid
  )
RETURNS TABLE (
    source_match_id uuid,
    handshake_status text,
    player_one_accepted boolean,
    player_two_accepted boolean,
    rematch_match_id uuid,
    player_one_session_id uuid,
    player_two_session_id uuid,
    matched_at timestamptz
  )
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_match
    public.cing_artillery_matches%ROWTYPE;

  v_handshake
    public.cing_artillery_rematch_handshakes%ROWTYPE;

  v_player_one_source_session
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_player_two_source_session
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_player_one_active_session
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_player_two_active_session
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_player_one_new_session
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_player_two_new_session
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_rematch
    public.cing_artillery_matches%ROWTYPE;

  v_terminal_at timestamptz;

  v_waiting_ticket_count integer := 0;
BEGIN
  IF p_source_match_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_REMATCH_SOURCE_MATCH_REQUIRED';
  END IF;

  IF p_account_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_REMATCH_ACCOUNT_REQUIRED';
  END IF;

  /*
   * source_match_id is the serialization root.
   * Every consent for the same rematch therefore acquires
   * the same first durable lock.
   */
  SELECT m.*
  INTO v_match
  FROM public.cing_artillery_matches AS m
  WHERE m.id = p_source_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_REMATCH_SOURCE_MATCH_NOT_FOUND';
  END IF;

  IF v_match.status <> 'completed'
     OR v_match.completed_at IS NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_REMATCH_SOURCE_MATCH_NOT_COMPLETED';
  END IF;

  IF p_account_id NOT IN (
    v_match.player_one_account_id,
    v_match.player_two_account_id
  )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '42501',
        MESSAGE =
          'CING_ARTILLERY_REMATCH_NOT_PARTICIPANT';
  END IF;

  /*
   * Source sessions are historical proof.
   * Lock deterministically and require terminal state.
   */
  PERFORM s.id
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id IN (
    v_match.player_one_session_id,
    v_match.player_two_session_id
  )
  ORDER BY s.id
  FOR UPDATE;

  SELECT s.*
  INTO v_player_one_source_session
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
      v_match.player_one_session_id
    AND s.account_id =
      v_match.player_one_account_id;

  SELECT s.*
  INTO v_player_two_source_session
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
      v_match.player_two_session_id
    AND s.account_id =
      v_match.player_two_account_id;

  IF v_player_one_source_session.id IS NULL
     OR v_player_two_source_session.id IS NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_REMATCH_SOURCE_SESSION_INCONSISTENT';
  END IF;

  IF v_player_one_source_session.status NOT IN (
       'completed',
       'abandoned'
     )
     OR
     v_player_two_source_session.status NOT IN (
       'completed',
       'abandoned'
     )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_REMATCH_SOURCE_SESSION_NOT_TERMINAL';
  END IF;

  /*
   * Caller must still have current gameplay access even to
   * register consent.
   */
  IF NOT
    public.cing_artillery_account_has_effective_gameplay_access_private_v1(
      p_account_id
    )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE = 'cing_artillery_disabled';
  END IF;

  INSERT INTO
    public.cing_artillery_rematch_handshakes (
      source_match_id,
      player_one_account_id,
      player_two_account_id
    )
  VALUES (
    v_match.id,
    v_match.player_one_account_id,
    v_match.player_two_account_id
  )
  ON CONFLICT (
    source_match_id
  )
  DO NOTHING;

  SELECT h.*
  INTO v_handshake
  FROM public.cing_artillery_rematch_handshakes AS h
  WHERE h.source_match_id =
    v_match.id
  FOR UPDATE;

  IF
    v_handshake.player_one_account_id <>
      v_match.player_one_account_id
    OR
    v_handshake.player_two_account_id <>
      v_match.player_two_account_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_REMATCH_HANDSHAKE_IDENTITY_CONFLICT';
  END IF;

  /*
   * Completed handshake is immutable/idempotent.
   */
  IF v_handshake.status = 'matched' THEN
    RETURN QUERY
    SELECT
      v_handshake.source_match_id,
      v_handshake.status,
      TRUE,
      TRUE,
      v_handshake.rematch_match_id,
      v_handshake.player_one_session_id,
      v_handshake.player_two_session_id,
      v_handshake.matched_at;

    RETURN;
  END IF;

  IF p_account_id =
       v_handshake.player_one_account_id
  THEN
    UPDATE
      public.cing_artillery_rematch_handshakes
    SET
      player_one_accepted_at =
        COALESCE(
          player_one_accepted_at,
          clock_timestamp()
        ),
      updated_at =
        clock_timestamp()
    WHERE source_match_id =
      v_handshake.source_match_id;

  ELSE
    UPDATE
      public.cing_artillery_rematch_handshakes
    SET
      player_two_accepted_at =
        COALESCE(
          player_two_accepted_at,
          clock_timestamp()
        ),
      updated_at =
        clock_timestamp()
    WHERE source_match_id =
      v_handshake.source_match_id;
  END IF;

  SELECT h.*
  INTO v_handshake
  FROM public.cing_artillery_rematch_handshakes AS h
  WHERE h.source_match_id =
    v_match.id
  FOR UPDATE;

  /*
   * First consent is durable but creates no gameplay state.
   */
  IF v_handshake.player_one_accepted_at IS NULL
     OR
     v_handshake.player_two_accepted_at IS NULL
  THEN
    RETURN QUERY
    SELECT
      v_handshake.source_match_id,
      v_handshake.status,
      v_handshake.player_one_accepted_at
        IS NOT NULL,
      v_handshake.player_two_accepted_at
        IS NOT NULL,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::timestamptz;

    RETURN;
  END IF;

  /*
   * Mutual consent now exists.
   *
   * Lock both canonical accounts in deterministic UUID order
   * before admission checks/session creation.
   */
  PERFORM a.id
  FROM public.cing_artillery_accounts AS a
  WHERE a.id IN (
    v_match.player_one_account_id,
    v_match.player_two_account_id
  )
  ORDER BY a.id
  FOR UPDATE;

  IF NOT
    public.cing_artillery_account_has_effective_gameplay_access_private_v1(
      v_match.player_one_account_id
    )
    OR NOT
    public.cing_artillery_account_has_effective_gameplay_access_private_v1(
      v_match.player_two_account_id
    )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_REMATCH_PARTICIPANT_ACCESS_REVOKED';
  END IF;

  /*
   * A rematch may never hijack an active session created by
   * another gameplay flow.
   */
  SELECT s.*
  INTO v_player_one_active_session
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.account_id =
      v_match.player_one_account_id
    AND s.status = 'active'
  LIMIT 1
  FOR UPDATE;

  SELECT s.*
  INTO v_player_two_active_session
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.account_id =
      v_match.player_two_account_id
    AND s.status = 'active'
  LIMIT 1
  FOR UPDATE;

  IF v_player_one_active_session.id IS NOT NULL
     OR
     v_player_two_active_session.id IS NOT NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_REMATCH_ACTIVE_SESSION_CONFLICT';
  END IF;

  /*
   * Historical matched tickets are allowed.
   * A live waiting ticket is not.
   */
  SELECT count(*)
  INTO v_waiting_ticket_count
  FROM public.cing_artillery_matchmaking_tickets AS t
  WHERE t.account_id IN (
    v_match.player_one_account_id,
    v_match.player_two_account_id
  )
    AND t.status = 'waiting';

  IF v_waiting_ticket_count <> 0 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_REMATCH_WAITING_TICKET_CONFLICT';
  END IF;

  v_terminal_at :=
    clock_timestamp();

  /*
   * Exactly two fresh sessions.
   */
  INSERT INTO
    public.cing_artillery_gameplay_sessions (
      id,
      account_id,
      status,
      started_at
    )
  VALUES (
    gen_random_uuid(),
    v_match.player_one_account_id,
    'active',
    v_terminal_at
  )
  RETURNING *
  INTO v_player_one_new_session;

  INSERT INTO
    public.cing_artillery_gameplay_sessions (
      id,
      account_id,
      status,
      started_at
    )
  VALUES (
    gen_random_uuid(),
    v_match.player_two_account_id,
    'active',
    v_terminal_at
  )
  RETURNING *
  INTO v_player_two_new_session;

  /*
   * Exact same opponent pair, new immutable match identity.
   */
  INSERT INTO
    public.cing_artillery_matches (
      id,
      player_one_account_id,
      player_one_session_id,
      player_two_account_id,
      player_two_session_id,
      status,
      matched_at
    )
  VALUES (
    gen_random_uuid(),
    v_match.player_one_account_id,
    v_player_one_new_session.id,
    v_match.player_two_account_id,
    v_player_two_new_session.id,
    'matched',
    v_terminal_at
  )
  RETURNING *
  INTO v_rematch;

  /*
   * Preserve normal provenance:
   * each fresh gameplay session owns one matched ticket.
   *
   * These are not queue tickets and never enter opponent
   * selection.
   */
  INSERT INTO
    public.cing_artillery_matchmaking_tickets (
      id,
      account_id,
      gameplay_session_id,
      status,
      match_id,
      queued_at,
      matched_at
    )
  VALUES
    (
      gen_random_uuid(),
      v_match.player_one_account_id,
      v_player_one_new_session.id,
      'matched',
      v_rematch.id,
      v_terminal_at,
      v_terminal_at
    ),
    (
      gen_random_uuid(),
      v_match.player_two_account_id,
      v_player_two_new_session.id,
      'matched',
      v_rematch.id,
      v_terminal_at,
      v_terminal_at
    );

  UPDATE
    public.cing_artillery_rematch_handshakes
  SET
    status = 'matched',
    rematch_match_id =
      v_rematch.id,
    player_one_session_id =
      v_player_one_new_session.id,
    player_two_session_id =
      v_player_two_new_session.id,
    matched_at =
      v_terminal_at,
    updated_at =
      v_terminal_at
  WHERE source_match_id =
    v_match.id
    AND status = 'waiting';

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_REMATCH_FINALIZATION_CONFLICT';
  END IF;

  SELECT h.*
  INTO v_handshake
  FROM public.cing_artillery_rematch_handshakes AS h
  WHERE h.source_match_id =
    v_match.id;

  RETURN QUERY
  SELECT
    v_handshake.source_match_id,
    v_handshake.status,
    TRUE,
    TRUE,
    v_handshake.rematch_match_id,
    v_handshake.player_one_session_id,
    v_handshake.player_two_session_id,
    v_handshake.matched_at;
END;
$$;


REVOKE ALL
ON TABLE
  public.cing_artillery_rematch_handshakes
FROM PUBLIC;

REVOKE ALL
ON TABLE
  public.cing_artillery_rematch_handshakes
FROM anon;

REVOKE ALL
ON TABLE
  public.cing_artillery_rematch_handshakes
FROM authenticated;

REVOKE ALL
ON TABLE
  public.cing_artillery_rematch_handshakes
FROM service_role;

GRANT SELECT
ON TABLE
  public.cing_artillery_rematch_handshakes
TO service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_request_same_opponent_rematch_atomic_v1(
    uuid,
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_request_same_opponent_rematch_atomic_v1(
    uuid,
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_request_same_opponent_rematch_atomic_v1(
    uuid,
    uuid
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_request_same_opponent_rematch_atomic_v1(
    uuid,
    uuid
  )
TO service_role;

COMMIT;
