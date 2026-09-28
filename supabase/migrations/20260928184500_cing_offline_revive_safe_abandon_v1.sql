begin;

/*
 * CING GAME CENTER V2
 * SAFE OFFLINE REVIVAL ABANDON V1
 *
 * Purpose:
 *   Resolve an already-authorized session when the browser/WebView
 *   canvas no longer exists and therefore cannot be reconstructed.
 *
 * This is NOT score finalization.
 *
 * It does NOT:
 * - create game_scores;
 * - create reward delivery;
 * - debit Revive Credit;
 * - debit Wallet;
 * - debit loyalty points;
 * - mutate game_plays;
 * - grant customer/browser EXECUTE.
 */

alter table public.cing_offline_revive_sessions
  add column abandoned_at timestamptz;

/*
 * Terminal lifecycle now distinguishes:
 *
 * finalized = score/result was explicitly finalized
 * abandoned = lost canvas/session was closed without score
 */

alter table public.cing_offline_revive_sessions
  drop constraint cing_offline_revive_status_ck;

alter table public.cing_offline_revive_sessions
  add constraint cing_offline_revive_status_ck
  check (
    status in (
      'active',
      'revive_pending',
      'finalized',
      'abandoned'
    )
  );

alter table public.cing_offline_revive_sessions
  drop constraint cing_offline_revive_lifecycle_ck;

alter table public.cing_offline_revive_sessions
  add constraint cing_offline_revive_lifecycle_ck
  check (
    (
      status = 'active'
      and pending_reason is null
      and pending_at is null
      and finalized_at is null
      and abandoned_at is null
    )
    or
    (
      status = 'revive_pending'
      and pending_reason is not null
      and pending_at is not null
      and finalized_at is null
      and abandoned_at is null
    )
    or
    (
      status = 'finalized'
      and pending_reason is null
      and pending_at is null
      and finalized_at is not null
      and abandoned_at is null
    )
    or
    (
      status = 'abandoned'
      and pending_reason is null
      and pending_at is null
      and finalized_at is null
      and abandoned_at is not null
    )
  );

alter table public.cing_offline_revive_sessions
  add constraint cing_offline_revive_abandoned_time_ck
  check (
    abandoned_at is null
    or abandoned_at >= created_at
  );

/*
 * Only genuinely live sessions belong in the expiry index.
 */

drop index public.cing_offline_revive_active_expiry_idx;

create index cing_offline_revive_active_expiry_idx
on public.cing_offline_revive_sessions (expires_at)
where status in ('active', 'revive_pending');


create function public.cing_offline_revive_abandon_v1(
  p_user_id text,
  p_session_id uuid,
  p_request_id uuid,
  p_expected_event_seq integer
)
returns table (
  applied boolean,
  session_id uuid,
  session_status text,
  event_seq integer,
  revives_used integer,
  abandoned_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id text;
  v_session public.cing_offline_revive_sessions%rowtype;
begin

  v_user_id :=
    nullif(
      btrim(coalesce(p_user_id, '')),
      ''
    );

  if v_user_id is null
     or p_session_id is null
     or p_request_id is null
     or p_expected_event_seq is null
     or p_expected_event_seq < 0
     or p_expected_event_seq >= 2147483647
  then
    raise exception
      'REVIVAL_ABANDON_ARGUMENT_INVALID'
      using errcode = '22023';
  end if;

  /*
   * Serialize against pending/revive/finalize.
   */

  select *
    into v_session
  from public.cing_offline_revive_sessions s
  where s.id = p_session_id
  for update;

  if not found
     or v_session.user_id <> v_user_id
  then
    raise exception
      'REVIVAL_SESSION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  /*
   * Bind abandonment to the exact original session start.
   * No caller may close another business request.
   */

  if v_session.request_id <> p_request_id then
    raise exception
      'REVIVAL_ABANDON_REQUEST_CONFLICT'
      using errcode = '23505';
  end if;

  /*
   * Exact replay of a completed abandonment is safe.
   * event_seq is intentionally not advanced by abandonment.
   */

  if v_session.status = 'abandoned' then

    if v_session.event_seq <> p_expected_event_seq then
      raise exception
        'REVIVAL_ABANDON_SEQUENCE_CONFLICT'
        using errcode = '40001';
    end if;

    return query
    select
      false,
      v_session.id,
      'abandoned'::text,
      v_session.event_seq,
      v_session.revives_used,
      v_session.abandoned_at;

    return;
  end if;

  /*
   * A scored/finalized result must never be converted
   * into an abandoned result.
   */

  if v_session.status = 'finalized' then
    raise exception
      'REVIVAL_SESSION_ALREADY_FINALIZED'
      using errcode = '55000';
  end if;

  if v_session.status not in (
    'active',
    'revive_pending'
  ) then
    raise exception
      'REVIVAL_ABANDON_STATE_CONFLICT'
      using errcode = '55000';
  end if;

  if v_session.event_seq <> p_expected_event_seq then
    raise exception
      'REVIVAL_ABANDON_SEQUENCE_CONFLICT'
      using errcode = '40001';
  end if;

  update public.cing_offline_revive_sessions s
  set
    status = 'abandoned',
    pending_reason = null,
    pending_at = null,
    abandoned_at = clock_timestamp()
  where s.id = v_session.id
  returning *
    into v_session;

  return query
  select
    true,
    v_session.id,
    'abandoned'::text,
    v_session.event_seq,
    v_session.revives_used,
    v_session.abandoned_at;

end;
$function$;

revoke all
on function public.cing_offline_revive_abandon_v1(
  text,
  uuid,
  uuid,
  integer
)
from public, anon, authenticated, service_role;

grant execute
on function public.cing_offline_revive_abandon_v1(
  text,
  uuid,
  uuid,
  integer
)
to service_role;

commit;
