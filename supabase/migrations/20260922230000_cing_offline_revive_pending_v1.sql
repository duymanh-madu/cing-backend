begin;

/*
 * CING GAME CENTER V2
 * OFFLINE REVIVE PENDING AUTHORITY V1
 *
 * Dependency order:
 * credit foundation -> private credit mutation
 * -> offline sessions -> offline events
 * -> offline start -> this migration.
 *
 * The trusted backend must bind p_user_id to
 * the authenticated player.
 *
 * This function does not debit revive credits.
 */

create function public.cing_offline_revive_pending_v1(
  p_user_id text,
  p_session_id uuid,
  p_request_id uuid,
  p_expected_event_seq integer,
  p_reason text
)
returns table (
  applied boolean,
  session_id uuid,
  event_id bigint,
  session_status text,
  event_seq integer,
  revives_used integer,
  pending_reason text,
  pending_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_reason text;
  v_session public.cing_offline_revive_sessions%rowtype;
  v_existing public.cing_offline_revive_events%rowtype;
  v_latest_revived_at timestamptz;
  v_deadline timestamptz;
  v_now timestamptz;
  v_event_id bigint;
  v_next_seq integer;
begin
  v_user_id :=
    nullif(btrim(coalesce(p_user_id, '')), '');

  v_reason :=
    nullif(btrim(coalesce(p_reason, '')), '');

  if v_user_id is null
     or p_session_id is null
     or p_request_id is null
     or p_expected_event_seq is null
     or p_expected_event_seq < 0
     or p_expected_event_seq >= 2147483647
  then
    raise exception 'REVIVAL_PENDING_ARGUMENT_INVALID'
      using errcode = '22023';
  end if;

  if v_reason not in ('timeout', 'death')
     or v_reason is null
  then
    raise exception 'REVIVAL_PENDING_REASON_INVALID'
      using errcode = '22023';
  end if;

  /*
   * Serialize transitions for one session.
   * Replay must be checked after acquiring
   * this lock.
   */

  select *
    into v_session
  from public.cing_offline_revive_sessions s
  where s.id = p_session_id
    and s.user_id = v_user_id
  for update;

  if not found then
    raise exception 'REVIVAL_SESSION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  select *
    into v_existing
  from public.cing_offline_revive_events e
  where e.user_id = v_user_id
    and e.request_id = p_request_id;

  if found then
    if v_existing.session_id <> p_session_id
       or v_existing.event_type <> 'revive_pending'
       or v_existing.pending_reason <> v_reason
       or v_existing.event_seq <> p_expected_event_seq + 1
    then
      raise exception 'REVIVAL_PENDING_REFERENCE_CONFLICT'
        using errcode = '23505';
    end if;

    return query
    select
      false,
      v_existing.session_id,
      v_existing.id,
      v_session.status,
      v_existing.event_seq,
      v_session.revives_used,
      v_existing.pending_reason,
      v_existing.created_at;

    return;
  end if;

  v_now := clock_timestamp();

  if v_now >= v_session.expires_at then
    raise exception 'REVIVAL_SESSION_EXPIRED'
      using errcode = 'P0001';
  end if;

  if v_session.status <> 'active' then
    raise exception 'REVIVAL_SESSION_NOT_ACTIVE'
      using errcode = 'P0001';
  end if;

  if v_session.event_seq <> p_expected_event_seq then
    raise exception 'REVIVAL_EVENT_SEQUENCE_CONFLICT'
      using errcode = '23505';
  end if;

  /*
   * Game-specific eligibility.
   *
   * Stack Tower initial deadline:
   * server-created session time + 120 seconds.
   *
   * After a successful revival:
   * last revived event time + 30 seconds.
   *
   * Pending decision time is not deducted
   * from the next 30-second gameplay period.
   */

  if v_session.game_key = 'cing-stack-tower' then
    if v_reason <> 'timeout' then
      raise exception 'REVIVAL_GAME_REASON_MISMATCH'
        using errcode = '22023';
    end if;

    if v_session.revives_used = 0 then
      v_deadline :=
        v_session.created_at + interval '120 seconds';
    else
      select max(e.created_at)
        into v_latest_revived_at
      from public.cing_offline_revive_events e
      where e.session_id = v_session.id
        and e.event_type = 'revived'
        and e.revive_index = v_session.revives_used;

      if v_latest_revived_at is null then
        raise exception 'REVIVAL_TIMER_HISTORY_MISSING'
          using errcode = '55000';
      end if;

      v_deadline :=
        v_latest_revived_at + interval '30 seconds';
    end if;

    if v_now < v_deadline then
      raise exception 'REVIVAL_TOWER_NOT_TIMED_OUT'
        using errcode = 'P0001';
    end if;

  elsif v_session.game_key = 'black-pearl-rush' then
    if v_reason <> 'death' then
      raise exception 'REVIVAL_GAME_REASON_MISMATCH'
        using errcode = '22023';
    end if;

    /*
     * The existing Pearl Rush physics runs on
     * the frontend. This is a client-attested
     * death, not independently verified physics.
     */

  else
    raise exception 'REVIVAL_GAME_NOT_SUPPORTED'
      using errcode = '22023';
  end if;

  v_next_seq := v_session.event_seq + 1;

  insert into public.cing_offline_revive_events (
    session_id,
    user_id,
    request_id,
    event_seq,
    event_type,
    pending_reason
  )
  values (
    v_session.id,
    v_user_id,
    p_request_id,
    v_next_seq,
    'revive_pending',
    v_reason
  )
  returning id into v_event_id;

  update public.cing_offline_revive_sessions s
  set status = 'revive_pending',
      event_seq = v_next_seq,
      pending_reason = v_reason,
      pending_at = v_now
  where s.id = v_session.id;

  return query
  select
    true,
    v_session.id,
    v_event_id,
    'revive_pending'::text,
    v_next_seq,
    v_session.revives_used,
    v_reason,
    v_now;
end;
$$;

revoke all
on function public.cing_offline_revive_pending_v1(
  text,
  uuid,
  uuid,
  integer,
  text
)
from public, anon, authenticated, service_role;

grant execute
on function public.cing_offline_revive_pending_v1(
  text,
  uuid,
  uuid,
  integer,
  text
)
to service_role;

commit;
