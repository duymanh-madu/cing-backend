begin;

/*
 * CING GAME CENTER V2
 * OFFLINE ATOMIC REVIVAL V1
 *
 * Requires the six preceding V2 migrations.
 *
 * Backend must bind p_user_id to the
 * authenticated member.
 *
 * This function is the only business operation
 * that combines an offline revival with a
 * revive-credit debit.
 */

create function public.cing_offline_revive_apply_v1(
  p_user_id text,
  p_session_id uuid,
  p_request_id uuid,
  p_expected_event_seq integer,
  p_pending_event_id bigint
)
returns table (
  applied boolean,
  session_id uuid,
  event_id bigint,
  event_seq integer,
  revive_index integer,
  credit_cost integer,
  credit_transaction_id bigint,
  balance_after integer,
  session_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_session public.cing_offline_revive_sessions%rowtype;
  v_existing public.cing_offline_revive_events%rowtype;
  v_pending public.cing_offline_revive_events%rowtype;
  v_credit public.cing_revive_credit_transactions%rowtype;
  v_applied boolean;
  v_credit_tx_id bigint;
  v_balance_after integer;
  v_next_index integer;
  v_cost integer;
  v_next_seq integer;
  v_event_id bigint;
begin

  v_user_id :=
    nullif(btrim(coalesce(p_user_id, '')), '');

  if v_user_id is null
     or p_session_id is null
     or p_request_id is null
     or p_pending_event_id is null
     or p_expected_event_seq is null
     or p_expected_event_seq < 1
     or p_expected_event_seq >= 2147483647
  then
    raise exception 'REVIVAL_APPLY_ARGUMENT_INVALID'
      using errcode = '22023';
  end if;

  /*
   * The session row is the transition lock.
   * Every business mutation for this session
   * must respect this lock ordering.
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

  /*
   * Durable replay FIRST, before checking
   * current status or remaining credits.
   * A valid old retry must not spend again.
   */

  select *
    into v_existing
  from public.cing_offline_revive_events e
  where e.user_id = v_user_id
    and e.request_id = p_request_id;

  if found then

    if v_existing.session_id <> p_session_id
       or v_existing.event_type <> 'revived'
       or v_existing.event_seq
            <> p_expected_event_seq + 1
    then
      raise exception 'REVIVAL_APPLY_REFERENCE_CONFLICT'
        using errcode = '23505';
    end if;

    select *
      into v_pending
    from public.cing_offline_revive_events e
    where e.id = p_pending_event_id
      and e.session_id = p_session_id
      and e.user_id = v_user_id
      and e.event_type = 'revive_pending'
      and e.event_seq = p_expected_event_seq;

    if not found then
      raise exception 'REVIVAL_APPLY_REFERENCE_CONFLICT'
        using errcode = '23505';
    end if;

    select *
      into v_credit
    from public.cing_revive_credit_transactions t
    where t.id = v_existing.credit_transaction_id
      and t.user_id = v_user_id
      and t.session_id = p_session_id
      and t.reference_type = 'offline_revive'
      and t.reference_id = p_request_id::text;

    if not found then
      raise exception 'REVIVAL_APPLY_HISTORY_INCONSISTENT'
        using errcode = '55000';
    end if;

    return query
    select
      false,
      v_existing.session_id,
      v_existing.id,
      v_existing.event_seq,
      v_existing.revive_index,
      v_existing.credit_cost,
      v_existing.credit_transaction_id,
      v_credit.balance_after,
      v_session.status;

    return;
  end if;

  if clock_timestamp() >= v_session.expires_at then
    raise exception 'REVIVAL_SESSION_EXPIRED'
      using errcode = 'P0001';
  end if;

  if v_session.status <> 'revive_pending' then
    raise exception 'REVIVAL_SESSION_NOT_PENDING'
      using errcode = 'P0001';
  end if;

  if v_session.event_seq <> p_expected_event_seq then
    raise exception 'REVIVAL_EVENT_SEQUENCE_CONFLICT'
      using errcode = '23505';
  end if;

  select *
    into v_pending
  from public.cing_offline_revive_events e
  where e.id = p_pending_event_id
    and e.session_id = p_session_id
    and e.user_id = v_user_id
    and e.event_type = 'revive_pending'
    and e.event_seq = p_expected_event_seq
    and e.pending_reason = v_session.pending_reason;

  if not found then
    raise exception 'REVIVAL_PENDING_EVENT_MISMATCH'
      using errcode = '23505';
  end if;

  if v_session.revives_used >= 5 then
    raise exception 'REVIVAL_LIMIT_REACHED'
      using errcode = 'P0001';
  end if;

  /*
   * The client never supplies a credit cost.
   */

  v_next_index := v_session.revives_used + 1;

  v_cost :=
    case v_next_index
      when 1 then 1
      when 2 then 2
      when 3 then 4
      when 4 then 8
      when 5 then 16
    end;

  if v_cost is null then
    raise exception 'REVIVAL_COST_INVALID'
      using errcode = '55000';
  end if;

  v_next_seq := v_session.event_seq + 1;

  /*
   * Private credit mutation and the following
   * session/event writes share the SAME SQL
   * transaction. No external Wallet operation.
   */

  select c.applied,
         c.transaction_id,
         c.balance_after
    into v_applied,
         v_credit_tx_id,
         v_balance_after
  from public.cing_revive_credit_apply_private_v1(
    v_user_id,
    -v_cost,
    'Offline game revival',
    'offline_revive',
    p_request_id::text,
    v_session.game_key,
    v_session.id,
    jsonb_build_object(
      'revive_index', v_next_index,
      'pending_event_id', p_pending_event_id
    )
  ) c;

  if v_applied is distinct from true
     or v_credit_tx_id is null
  then
    raise exception 'REVIVAL_CREDIT_APPLY_INCONSISTENT'
      using errcode = '55000';
  end if;

  insert into public.cing_offline_revive_events (
    session_id,
    user_id,
    request_id,
    event_seq,
    event_type,
    revive_index,
    credit_cost,
    credit_transaction_id
  )
  values (
    v_session.id,
    v_user_id,
    p_request_id,
    v_next_seq,
    'revived',
    v_next_index,
    v_cost,
    v_credit_tx_id
  )
  returning id
    into v_event_id;

  update public.cing_offline_revive_sessions s
  set status = 'active',
      event_seq = v_next_seq,
      revives_used = v_next_index,
      pending_reason = null,
      pending_at = null
  where s.id = v_session.id;

  return query
  select
    true,
    v_session.id,
    v_event_id,
    v_next_seq,
    v_next_index,
    v_cost,
    v_credit_tx_id,
    v_balance_after,
    'active'::text;

end;
$$;

revoke all
on function public.cing_offline_revive_apply_v1(
  text,
  uuid,
  uuid,
  integer,
  bigint
)
from public, anon, authenticated, service_role;

grant execute
on function public.cing_offline_revive_apply_v1(
  text,
  uuid,
  uuid,
  integer,
  bigint
)
to service_role;

commit;
