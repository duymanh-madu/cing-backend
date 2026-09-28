begin;

/*
 * CING GAME CENTER V2
 *
 * Atomic durable analytics delivery.
 *
 * The finalized game_scores row remains
 * the source of score identity and value.
 *
 * A current worker may deliver analytics
 * only while holding an unexpired lease.
 *
 * Analytics insert and analytics_done ACK
 * occur in one PostgreSQL transaction.
 *
 * Does not insert game_scores,
 * grant loyalty points, consume credits,
 * mutate Wallet or complete daily missions.
 */

create function
  public.cing_offline_revive_score_analytics_v1(
    p_score_id bigint,
    p_worker_token uuid
  )
returns table (
  accepted boolean,
  created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job
    public.cing_offline_revive_score_outbox%rowtype;

  v_score
    public.game_scores%rowtype;

  v_previous_alltime_best numeric;
  v_previous_weekly_best numeric;

  v_week_start timestamptz;

  v_existing_user_id text;
  v_existing_game_key text;
  v_existing_score text;

  v_rows integer;
  v_created boolean := false;
begin

  if p_score_id is null
     or p_worker_token is null
  then
    raise exception
      'REVIVAL_SCORE_ANALYTICS_ARGUMENT_INVALID'
      using errcode = '22023';
  end if;

  /*
   * Fail closed if the analytics identity
   * migration has not been applied.
   */

  if to_regclass(
    'public.analytics_events_offline_revive_score_uidx'
  ) is null then
    raise exception
      'REVIVAL_SCORE_ANALYTICS_IDENTITY_MISSING'
      using errcode = '55000';
  end if;

  /*
   * Lock the job before inspecting or
   * creating its analytics side effect.
   */

  select o.*
    into v_job
  from public.cing_offline_revive_score_outbox o
  where o.score_id = p_score_id
    and o.worker_token = p_worker_token
    and o.status = 'processing'
    and o.locked_until > clock_timestamp()
  for update;

  if not found then
    return query
      select false, false;

    return;
  end if;

  /*
   * Score fields come exclusively from
   * PostgreSQL, never worker payload.
   */

  select g.*
    into v_score
  from public.game_scores g
  where g.id = v_job.score_id
    and g.offline_revive_session_id =
      v_job.session_id
    and g.game_key = v_job.game_key
    and g.user_id = v_job.user_id;

  if not found then
    raise exception
      'REVIVAL_SCORE_ANALYTICS_BINDING_INVALID'
      using errcode = '55000';
  end if;

  /*
   * Use the score's own played_at,
   * rather than worker delivery time.
   *
   * Monday 00:00 in Vietnam.
   */

  v_week_start :=
    date_trunc(
      'week',
      v_score.played_at
        at time zone 'Asia/Ho_Chi_Minh'
    )
    at time zone 'Asia/Ho_Chi_Minh';

  /*
   * The historical comparison excludes
   * this score and later scores.
   *
   * played_at + id provide a stable
   * chronological tie-break.
   */

  select coalesce(max(g.score), 0)
    into v_previous_alltime_best
  from public.game_scores g
  where g.game_key = v_score.game_key
    and g.user_id = v_score.user_id
    and (
      g.played_at < v_score.played_at
      or (
        g.played_at = v_score.played_at
        and g.id < v_score.id
      )
    );

  select coalesce(max(g.score), 0)
    into v_previous_weekly_best
  from public.game_scores g
  where g.game_key = v_score.game_key
    and g.user_id = v_score.user_id
    and g.played_at >= v_week_start
    and (
      g.played_at < v_score.played_at
      or (
        g.played_at = v_score.played_at
        and g.id < v_score.id
      )
    );

  /*
   * Even if a worker reports an already
   * completed stage, its event identity
   * must actually exist and match.
   *
   * ON CONFLICT covers recovery after
   * a previously committed insert.
   */

  if not v_job.analytics_done then

    insert into public.analytics_events (
      event_name,
      user_id,
      event_data
    )
    values (
      'game_score',
      v_score.user_id,
      jsonb_build_object(
        'game_key',
        v_score.game_key,

        'score',
        v_score.score,

        'previous_alltime_best',
        v_previous_alltime_best,

        'previous_weekly_best',
        v_previous_weekly_best,

        'offline_revive_score_id',
        v_score.id::text
      )
    )
    on conflict do nothing;

    get diagnostics
      v_rows = row_count;

    v_created := v_rows = 1;

  end if;

  /*
   * Verify the durable analytics event.
   *
   * A conflicting score identity with
   * mismatched data must never be ACKed.
   */

  select
    ae.user_id,
    ae.event_data ->> 'game_key',
    ae.event_data ->> 'score'
  into
    v_existing_user_id,
    v_existing_game_key,
    v_existing_score
  from public.analytics_events ae
  where ae.event_name = 'game_score'
    and ae.event_data
      ->> 'offline_revive_score_id' =
        v_score.id::text
  limit 1;

  if not found
     or v_existing_user_id is distinct from
       v_score.user_id
     or v_existing_game_key is distinct from
       v_score.game_key
     or v_existing_score is distinct from
       v_score.score::text
  then
    raise exception
      'REVIVAL_SCORE_ANALYTICS_IDENTITY_CONFLICT'
      using errcode = '23505';
  end if;

  /*
   * The lease must still be valid
   * when ACK is written.
   *
   * If it expires inside this RPC,
   * the analytics insert rolls back.
   */

  update
    public.cing_offline_revive_score_outbox o
  set
    analytics_done = true,
    updated_at = clock_timestamp()
  where o.score_id = p_score_id
    and o.worker_token = p_worker_token
    and o.status = 'processing'
    and o.locked_until > clock_timestamp();

  if not found then
    raise exception
      'REVIVAL_SCORE_ANALYTICS_LEASE_EXPIRED'
      using errcode = '55000';
  end if;

  return query
    select true, v_created;

end;
$$;

/*
 * No browser execution.
 *
 * service_role invokes the narrow RPC;
 * direct outbox mutation remains revoked.
 */

revoke all
on function
  public.cing_offline_revive_score_analytics_v1(
    bigint, uuid
  )
from public, anon, authenticated,
     service_role;

grant execute
on function
  public.cing_offline_revive_score_analytics_v1(
    bigint, uuid
  )
to service_role;

commit;
