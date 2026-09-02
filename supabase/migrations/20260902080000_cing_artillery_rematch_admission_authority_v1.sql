BEGIN;

CREATE OR REPLACE FUNCTION
  public.cing_artillery_create_rematch_gameplay_session_atomic_v1(
    p_source_match_id uuid,
    p_account_id uuid
  )
RETURNS public.cing_artillery_gameplay_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_match
    public.cing_artillery_matches%ROWTYPE;

  v_source_session_id uuid;

  v_source_session
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_active_session
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_new_session
    public.cing_artillery_gameplay_sessions%ROWTYPE;
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

  IF v_match.player_one_account_id =
       p_account_id
  THEN
    v_source_session_id :=
      v_match.player_one_session_id;

  ELSIF v_match.player_two_account_id =
          p_account_id
  THEN
    v_source_session_id :=
      v_match.player_two_session_id;

  ELSE
    RAISE EXCEPTION
      USING
        ERRCODE = '42501',
        MESSAGE =
          'CING_ARTILLERY_REMATCH_NOT_PARTICIPANT';
  END IF;

  SELECT s.*
  INTO v_source_session
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id = v_source_session_id
    AND s.account_id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_REMATCH_SOURCE_SESSION_INCONSISTENT';
  END IF;

  IF v_source_session.status NOT IN (
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
   * Serialize rematch admission for this account.
   *
   * The partial unique index on active gameplay sessions
   * remains the final database fence. Repeated rematch
   * requests recover the same active session instead of
   * creating duplicate admissions.
   */
  PERFORM a.id
  FROM public.cing_artillery_accounts AS a
  WHERE a.id = p_account_id
    AND a.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_REMATCH_ACCOUNT_NOT_ACTIVE';
  END IF;

  /*
   * Rematch is new gameplay admission.
   *
   * It must obey the same effective-access authority as
   * normal gameplay-session creation and matchmaking.
   * Historical source-match validation above is read-only;
   * no historical state is rewritten when access is denied.
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

  SELECT s.*
  INTO v_active_session
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.account_id = p_account_id
    AND s.status = 'active'
  ORDER BY
    s.started_at DESC,
    s.id DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN v_active_session;
  END IF;

  INSERT INTO
    public.cing_artillery_gameplay_sessions (
      id,
      account_id,
      status,
      started_at
    )
  VALUES (
    gen_random_uuid(),
    p_account_id,
    'active',
    clock_timestamp()
  )
  RETURNING *
  INTO v_new_session;

  RETURN v_new_session;
END;
$$;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_create_rematch_gameplay_session_atomic_v1(
    uuid,
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_create_rematch_gameplay_session_atomic_v1(
    uuid,
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_create_rematch_gameplay_session_atomic_v1(
    uuid,
    uuid
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_create_rematch_gameplay_session_atomic_v1(
    uuid,
    uuid
  )
TO service_role;

COMMIT;
