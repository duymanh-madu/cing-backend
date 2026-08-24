BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- MATCHMAKING EFFECTIVE ACCESS V1
--
-- Canonical source:
--   manifest order 8
--   db/migrations/20260814_cing_artillery_matchmaking_foundation.sql
--
-- Semantics:
--
--   matched ticket:
--     durable historical recovery; no current-access gate
--
--   waiting/new ticket:
--     caller must retain effective gameplay access
--
--   opponent selection:
--     stale/revoked waiting accounts excluded
--
--   opponent post-lock:
--     access revalidated before durable match creation
--
-- Preserved:
--   caller gameplay-session FOR UPDATE
--   caller ticket serialization
--   FOR UPDATE OF opponent ticket SKIP LOCKED
--   opponent gameplay-session FOR UPDATE
--   opponent active-session revalidation
--   atomic match INSERT
--   exactly-two ticket matched transition
--
-- Not touched:
--   shot acceptance
--   combat/runtime/world/turn
--   end-session cleanup
--   execution worker
--   fenced result commit
--   result stream
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.cing_artillery_enter_matchmaking_atomic(
    p_account_id uuid,
    p_gameplay_session_id uuid
  )
RETURNS TABLE (
  ticket_id uuid,
  ticket_status text,
  gameplay_session_id uuid,
  match_id uuid,
  opponent_account_id uuid,
  opponent_gameplay_session_id uuid,
  queued_at timestamptz,
  matched_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_ticket
    public.cing_artillery_matchmaking_tickets%ROWTYPE;

  v_opponent
    public.cing_artillery_matchmaking_tickets%ROWTYPE;

  v_match
    public.cing_artillery_matches%ROWTYPE;

  v_updated_ticket_count integer :=
    0;
BEGIN
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE = 'CING_ARTILLERY_MATCHMAKING_ACCOUNT_REQUIRED';
  END IF;

  IF p_gameplay_session_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE = 'CING_ARTILLERY_MATCHMAKING_GAMEPLAY_SESSION_REQUIRED';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id = p_gameplay_session_id
    AND s.account_id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE = 'CING_ARTILLERY_GAMEPLAY_SESSION_NOT_FOUND';
  END IF;

  IF v_session.status <> 'active' THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE = 'CING_ARTILLERY_GAMEPLAY_SESSION_NOT_ACTIVE';
  END IF;

  -- A matched ticket belongs to its historical gameplay
  -- session and must never block a future gameplay session.
  --
  -- First resolve an existing ticket for this exact session.
  SELECT t.*
  INTO v_ticket
  FROM public.cing_artillery_matchmaking_tickets AS t
  WHERE t.account_id = p_account_id
    AND t.gameplay_session_id =
      p_gameplay_session_id
    AND t.status IN (
      'waiting',
      'matched'
    )
  ORDER BY t.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_ticket.status = 'matched' THEN
      SELECT m.*
      INTO v_match
      FROM public.cing_artillery_matches AS m
      WHERE m.id = v_ticket.match_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION
          USING
            ERRCODE = 'P0001',
            MESSAGE = 'CING_ARTILLERY_MATCHMAKING_STATE_INCONSISTENT';
      END IF;

      RETURN QUERY
      SELECT
        v_ticket.id,
        v_ticket.status,
        v_ticket.gameplay_session_id,
        v_ticket.match_id,

        CASE
          WHEN
            v_match.player_one_account_id =
            p_account_id
          THEN
            v_match.player_two_account_id
          ELSE
            v_match.player_one_account_id
        END,

        CASE
          WHEN
            v_match.player_one_account_id =
            p_account_id
          THEN
            v_match.player_two_session_id
          ELSE
            v_match.player_one_session_id
        END,

        v_ticket.queued_at,
        v_ticket.matched_at;

      RETURN;
    END IF;


    /*
     * Waiting/new-match progression requires current
     * effective gameplay access.
     *
     * Historical matched-ticket recovery above remains
     * deliberately access-independent.
     */
    IF NOT
      public.cing_artillery_account_has_effective_gameplay_access_private_v1(
        p_account_id
      )
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'cing_artillery_disabled';
    END IF;

  ELSE

    /*
     * Waiting/new-match progression requires current
     * effective gameplay access.
     *
     * Historical matched-ticket recovery above remains
     * deliberately access-independent.
     */
    IF NOT
      public.cing_artillery_account_has_effective_gameplay_access_private_v1(
        p_account_id
      )
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'cing_artillery_disabled';
    END IF;

    -- A different waiting ticket for this account means the
    -- account is already queued through another session.
    --
    -- Historical matched tickets are intentionally ignored.
    SELECT t.*
    INTO v_ticket
    FROM public.cing_artillery_matchmaking_tickets AS t
    WHERE t.account_id = p_account_id
      AND t.status = 'waiting'
    ORDER BY
      t.queued_at ASC,
      t.id ASC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE = 'CING_ARTILLERY_MATCHMAKING_LIVE_TICKET_CONFLICT';
    END IF;

    INSERT INTO
      public.cing_artillery_matchmaking_tickets (
        id,
        account_id,
        gameplay_session_id,
        status
      )
    VALUES (
      gen_random_uuid(),
      p_account_id,
      p_gameplay_session_id,
      'waiting'
    )
    RETURNING *
    INTO v_ticket;
  END IF;

  SELECT t.*
  INTO v_opponent
  FROM public.cing_artillery_matchmaking_tickets AS t
  JOIN public.cing_artillery_gameplay_sessions AS s
    ON s.id = t.gameplay_session_id
  WHERE t.status = 'waiting'
    AND t.id <> v_ticket.id
    AND t.account_id <> p_account_id
    AND s.status = 'active'
    AND
      public.cing_artillery_account_has_effective_gameplay_access_private_v1(
        t.account_id
      )
  ORDER BY
    t.queued_at ASC,
    t.id ASC
  LIMIT 1
  FOR UPDATE OF t
  SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      v_ticket.id,
      v_ticket.status,
      v_ticket.gameplay_session_id,
      v_ticket.match_id,
      NULL::uuid,
      NULL::uuid,
      v_ticket.queued_at,
      v_ticket.matched_at;

    RETURN;
  END IF;

  -- Lock the opponent gameplay session after locking its
  -- ticket, then revalidate both durable states.
  SELECT s.*
  INTO v_session
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id = v_opponent.gameplay_session_id
    AND s.account_id = v_opponent.account_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_session.status <> 'active'
     OR NOT
        public.cing_artillery_account_has_effective_gameplay_access_private_v1(
          v_opponent.account_id
        )
  THEN
    RETURN QUERY
    SELECT
      v_ticket.id,
      v_ticket.status,
      v_ticket.gameplay_session_id,
      v_ticket.match_id,
      NULL::uuid,
      NULL::uuid,
      v_ticket.queued_at,
      v_ticket.matched_at;

    RETURN;
  END IF;

  INSERT INTO public.cing_artillery_matches (
    id,
    player_one_account_id,
    player_one_session_id,
    player_two_account_id,
    player_two_session_id,
    status
  )
  VALUES (
    gen_random_uuid(),
    v_opponent.account_id,
    v_opponent.gameplay_session_id,
    p_account_id,
    p_gameplay_session_id,
    'matched'
  )
  RETURNING *
  INTO v_match;

  UPDATE public.cing_artillery_matchmaking_tickets AS t
  SET
    status = 'matched',
    match_id = v_match.id,
    matched_at = v_match.matched_at,
    updated_at = now()
  WHERE t.id IN (
    v_ticket.id,
    v_opponent.id
  )
    AND t.status = 'waiting';

  GET DIAGNOSTICS
    v_updated_ticket_count =
      ROW_COUNT;

  IF v_updated_ticket_count <> 2 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE = 'CING_ARTILLERY_MATCHMAKING_STATE_CONFLICT';
  END IF;

  SELECT t.*
  INTO v_ticket
  FROM public.cing_artillery_matchmaking_tickets AS t
  WHERE t.id = v_ticket.id;

  RETURN QUERY
  SELECT
    v_ticket.id,
    v_ticket.status,
    v_ticket.gameplay_session_id,
    v_ticket.match_id,
    v_opponent.account_id,
    v_opponent.gameplay_session_id,
    v_ticket.queued_at,
    v_ticket.matched_at;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_enter_matchmaking_atomic(
    uuid,
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_enter_matchmaking_atomic(
    uuid,
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_enter_matchmaking_atomic(
    uuid,
    uuid
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_enter_matchmaking_atomic(
    uuid,
    uuid
  )
FROM service_role;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_enter_matchmaking_atomic(
    uuid,
    uuid
  )
TO service_role;


COMMIT;
