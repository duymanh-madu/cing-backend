BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- DRAFT: execute only after database integration/concurrency tests and release review.
DO $preflight$
BEGIN
  IF md5(pg_get_functiondef('public.complete_daily_challenge_atomic(uuid,text,text,text,bigint)'::regprocedure))
    <> '08275691353f87ac419dd4beab9a70d9' THEN
    RAISE EXCEPTION 'STOP: production claim definition changed; review before applying';
  END IF;
END;
$preflight$;
-- Lock order shared with Admin Apply: app_configs -> daily_challenges -> players.
CREATE FUNCTION public.cing_daily_challenge_admin_config_v1(p_game_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $cfg$
DECLARE
  v_document jsonb;
  v_entries jsonb;
  v_entry jsonb;
  v_match jsonb := NULL;
  v_seen text[] := ARRAY[]::text[];
  v_key text;
BEGIN
  SELECT c.daily_challenge_config INTO v_document
  FROM public.app_configs c WHERE c.id = 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DAILY_CHALLENGE_CONFIG_MISSING'; END IF;
  v_entries := v_document->'challenges';
  IF jsonb_typeof(v_entries) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'DAILY_CHALLENGE_CONFIG_INVALID';
  END IF;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_entries) LOOP
    v_key := v_entry->>'game_key';
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_entry->'game_key') IS DISTINCT FROM 'string'
      OR nullif(btrim(v_key), '') IS NULL
      OR v_key = ANY(v_seen)
      OR jsonb_typeof(v_entry->'enabled') IS DISTINCT FROM 'boolean'
    THEN RAISE EXCEPTION 'DAILY_CHALLENGE_CONFIG_INVALID'; END IF;
    v_seen := array_append(v_seen, v_key);
    IF v_entry->'enabled' = 'true'::jsonb THEN
      IF coalesce(v_entry->>'challenge_type','') NOT IN ('combo','score','wins')
        OR jsonb_typeof(v_entry->'target_value') IS DISTINCT FROM 'number'
        OR jsonb_typeof(v_entry->'reward_points') IS DISTINCT FROM 'number'
      THEN RAISE EXCEPTION 'DAILY_CHALLENGE_CONFIG_INVALID'; END IF;
      IF (v_entry->>'target_value')::numeric <> trunc((v_entry->>'target_value')::numeric)
        OR (v_entry->>'reward_points')::numeric <> trunc((v_entry->>'reward_points')::numeric)
        OR (v_entry->>'target_value')::numeric NOT BETWEEN 1 AND 1000000
        OR (v_entry->>'reward_points')::numeric NOT BETWEEN 1 AND 1000000
      THEN RAISE EXCEPTION 'DAILY_CHALLENGE_CONFIG_INVALID'; END IF;
      IF v_key = p_game_key THEN v_match := v_entry; END IF;
    END IF;
  END LOOP;
  RETURN v_match;
END;
$cfg$;
REVOKE ALL ON FUNCTION public.cing_daily_challenge_admin_config_v1(text)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.cing_daily_challenge_resolve_admin_v1(p_game_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $resolve$
DECLARE
  v_cfg jsonb;
  v_today date;
  v_row public.daily_challenges%rowtype;
BEGIN
  IF p_game_key IN ('black-pearl-rush','cing-stack-tower') THEN
    RAISE EXCEPTION 'REVIVAL_CHALLENGE_V2_AUTHORITY_REQUIRED';
  END IF;
  v_cfg := public.cing_daily_challenge_admin_config_v1(p_game_key);
  IF v_cfg IS NULL THEN RETURN NULL; END IF;
  v_today := (clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  SELECT d.* INTO v_row FROM public.daily_challenges d
  WHERE d.challenge_date = v_today AND d.game_key = p_game_key FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.daily_challenges
      (challenge_date, game_key, challenge_type, target_value, reward_points, label)
    VALUES (v_today, p_game_key, v_cfg->>'challenge_type',
      (v_cfg->>'target_value')::integer, (v_cfg->>'reward_points')::integer,
      v_cfg->>'label')
    ON CONFLICT (challenge_date, game_key) DO NOTHING;
    SELECT d.* INTO STRICT v_row FROM public.daily_challenges d
    WHERE d.challenge_date = v_today AND d.game_key = p_game_key FOR UPDATE;
  END IF;
  IF NOT coalesce(v_row.completed,false) THEN
    UPDATE public.daily_challenges d SET
      challenge_type = v_cfg->>'challenge_type',
      target_value = (v_cfg->>'target_value')::integer,
      reward_points = (v_cfg->>'reward_points')::integer,
      label = v_cfg->>'label'
    WHERE d.id = v_row.id RETURNING d.* INTO v_row;
  END IF;
  RETURN to_jsonb(v_row);
END;
$resolve$;
REVOKE ALL ON FUNCTION public.cing_daily_challenge_resolve_admin_v1(text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cing_daily_challenge_resolve_admin_v1(text) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_daily_challenge_atomic(p_challenge_id uuid, p_user_id text, p_player_name text, p_player_avatar text, p_progress bigint)
 RETURNS TABLE(applied boolean, challenge_id uuid, winner_user_id text, winner_name text, reward_points integer, total_points_after integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin_config jsonb;
  v_challenge
    public.daily_challenges%rowtype;

  v_player
    public.players%rowtype;

  v_before_numeric numeric;
  v_before integer;
  v_after integer;
  v_reward integer;
  v_now timestamptz :=
    clock_timestamp();
begin
  -- Serialize with Admin save BEFORE acquiring challenge/player locks.
  PERFORM 1 FROM public.app_configs WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DAILY_CHALLENGE_CONFIG_MISSING'; END IF;

  if p_challenge_id is null then
    raise exception
      'DAILY_CHALLENGE_ID_REQUIRED'
      using errcode = '22023';
  end if;


  if nullif(
    btrim(
      coalesce(
        p_user_id,
        ''
      )
    ),
    ''
  ) is null then
    raise exception
      'DAILY_CHALLENGE_USER_ID_REQUIRED'
      using errcode = '22023';
  end if;


  if p_progress is null
     or p_progress < 0 then
    raise exception
      'DAILY_CHALLENGE_PROGRESS_INVALID'
      using errcode = '22023';
  end if;


  /*
   * Canonical serialization boundary for competing winners.
   */
  select c.*
  into v_challenge
  from public.daily_challenges c
  where c.id = p_challenge_id
  for update;


  if not found then
    raise exception
      'DAILY_CHALLENGE_NOT_FOUND'
      using errcode = 'P0002';
  end if;


  /*
   * Any replay after the first completed transaction is
   * financially inert.
   */
  if coalesce(
    v_challenge.completed,
    false
  ) then

    return query
    select
      false,
      v_challenge.id,
      v_challenge.winner_user_id,
      v_challenge.winner_name,
      coalesce(
        v_challenge.reward_points,
        0
      ),
      coalesce(
        (
          select
            p.total_points::integer
          from public.players p
          where p.user_id =
            p_user_id
        ),
        0
      );

    return;
  end if;


  IF v_challenge.game_key IN ('black-pearl-rush','cing-stack-tower') THEN
    RAISE EXCEPTION 'REVIVAL_CHALLENGE_V2_AUTHORITY_REQUIRED';
  END IF;
  v_admin_config := public.cing_daily_challenge_admin_config_v1(v_challenge.game_key);
  IF v_admin_config IS NULL THEN
    RAISE EXCEPTION 'DAILY_CHALLENGE_DISABLED_OR_REMOVED';
  END IF;
  IF v_challenge.challenge_date IS DISTINCT FROM
      (clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN
    RAISE EXCEPTION 'DAILY_CHALLENGE_DATE_EXPIRED';
  END IF;
  IF v_challenge.challenge_type IS DISTINCT FROM v_admin_config->>'challenge_type'
    OR v_challenge.target_value IS DISTINCT FROM (v_admin_config->>'target_value')::integer
    OR v_challenge.reward_points IS DISTINCT FROM (v_admin_config->>'reward_points')::integer
  THEN
    -- Config changed between resolve and claim. Refetch, never award stale values.
    RAISE EXCEPTION 'DAILY_CHALLENGE_CONFIG_CHANGED_RETRY';
  END IF;

  if p_progress <
    coalesce(
      v_challenge.target_value,
      0
    ) then
    raise exception
      'DAILY_CHALLENGE_TARGET_NOT_REACHED'
      using errcode = '22023';
  end if;


  v_reward :=
    coalesce(
      v_challenge.reward_points,
      0
    );


  if v_reward <= 0 then
    raise exception
      'DAILY_CHALLENGE_REWARD_INVALID'
      using errcode = '55000';
  end if;


  /*
   * Serialize total_points mutation with other DB authorities.
   */
  select p.*
  into v_player
  from public.players p
  where p.user_id =
    p_user_id
  for update;


  if not found then
    raise exception
      'DAILY_CHALLENGE_PLAYER_NOT_FOUND'
      using errcode = 'P0002';
  end if;


  v_before_numeric :=
    coalesce(
      v_player.total_points,
      0
    );


  if
    v_before_numeric <>
      trunc(
        v_before_numeric
      )
    or v_before_numeric < 0
    or v_before_numeric >
      2147483647
  then
    raise exception
      'DAILY_CHALLENGE_POINT_BALANCE_DOMAIN_INVALID'
      using errcode = '55000';
  end if;


  v_before :=
    v_before_numeric::integer;


  if v_before >
    2147483647 -
      v_reward
  then
    raise exception
      'DAILY_CHALLENGE_POINT_BALANCE_OVERFLOW'
      using errcode = '22003';
  end if;


  v_after :=
    v_before +
    v_reward;


  update public.players
  set total_points =
    v_after
  where user_id =
    p_user_id;


  /*
   * Completion and durable external delivery intent are part
   * of this SAME PostgreSQL transaction.
   */
  update public.daily_challenges
  set
    winner_user_id =
      p_user_id,
    winner_name =
      p_player_name,
    winner_avatar =
      p_player_avatar,
    completed =
      true,
    completed_at =
      v_now,

    ipos_sync_status =
      'pending',
    ipos_retry_count =
      0,
    ipos_next_retry_at =
      v_now,
    ipos_locked_until =
      null,
    ipos_synced_at =
      null,
    ipos_last_error =
      null

  where id =
    v_challenge.id;


  insert into public.point_transactions (
    user_id,
    transaction_type,
    points,
    balance_before,
    balance_after,
    reason,
    metadata,
    daily_challenge_id
  )
  values (
    p_user_id,
    'add',
    v_reward,
    v_before,
    v_after,
    'Phần thưởng thử thách ngày',
    jsonb_build_object(
      'phone',
        p_user_id,
      'daily_challenge_id',
        v_challenge.id,
      'challenge_date',
        v_challenge.challenge_date,
      'game_key',
        v_challenge.game_key
    ),
    v_challenge.id
  );


  return query
  select
    true,
    v_challenge.id,
    p_user_id,
    p_player_name,
    v_reward,
    v_after;

end;
$function$;

REVOKE ALL ON FUNCTION public.complete_daily_challenge_atomic(uuid,text,text,text,bigint)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_daily_challenge_atomic(uuid,text,text,text,bigint) TO service_role;
COMMIT;
