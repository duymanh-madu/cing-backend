begin;

/*
 * CING OFFLINE REVIVAL — REWARD DELIVERY V1
 *
 * Reward lease is independent of
 * Score Delivery's existing lease.
 *
 * No point or notification mutation.
 */

create function
public.cing_offline_revive_reward_claim_v1(
  p_lease_seconds integer default 300
)
returns setof
  public.cing_offline_revive_score_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score_id bigint;
  v_row
    public.cing_offline_revive_score_outbox%rowtype;
  v_now timestamptz;
begin
  if p_lease_seconds is null
    or p_lease_seconds < 30
    or p_lease_seconds > 900
  then
    raise exception
      'REVIVAL_REWARD_LEASE_INVALID'
      using errcode = '22023';
  end if;

  v_now := clock_timestamp();

  select o.score_id
  into v_score_id
  from public.cing_offline_revive_score_outbox o
  where (
    (
      o.reward_status = 'pending'
      and o.reward_next_attempt_at <= v_now
    )
    or
    (
      o.reward_status = 'processing'
      and o.reward_locked_until <= v_now
    )
  )
  order by
    o.reward_next_attempt_at asc,
    o.created_at asc,
    o.score_id asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.cing_offline_revive_score_outbox o
  set
    reward_status = 'processing',
    reward_attempt_count =
      o.reward_attempt_count + 1,
    reward_worker_token = gen_random_uuid(),
    reward_locked_until =
      clock_timestamp() +
      make_interval(secs => p_lease_seconds),
    reward_last_error = null
  where o.score_id = v_score_id
  returning * into v_row;

  return next v_row;
end;
$$;

/*
 * Renew only the current reward lease.
 * Cannot restore an expired lease.
 */

create function
public.cing_offline_revive_reward_renew_v1(
  p_score_id bigint,
  p_worker_token uuid,
  p_lease_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_score_id is null
    or p_worker_token is null
    or p_lease_seconds is null
    or p_lease_seconds < 30
    or p_lease_seconds > 900
  then
    raise exception
      'REVIVAL_REWARD_RENEW_ARGUMENT_INVALID'
      using errcode = '22023';
  end if;

  update public.cing_offline_revive_score_outbox o
  set
    reward_locked_until =
      clock_timestamp() +
      make_interval(secs => p_lease_seconds)
  where o.score_id = p_score_id
    and o.reward_worker_token =
      p_worker_token
    and o.reward_status = 'processing'
    and o.reward_locked_until >
      clock_timestamp();

  return found;
end;
$$;


/*
 * ACK financial processing only.
 * Notification delivery remains independent.
 */

create function
public.cing_offline_revive_reward_ack_v1(
  p_score_id bigint,
  p_worker_token uuid,
  p_outcome text,
  p_reason text default null
)
returns table (
  accepted boolean,
  outcome text,
  reward_applied boolean,
  notification_pending boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.cing_offline_revive_score_outbox%rowtype;
begin
  if p_score_id is null
    or p_worker_token is null
    or p_outcome not in ('completed', 'skipped')
    or p_outcome is null
  then
    raise exception 'REVIVAL_REWARD_ACK_ARGUMENT_INVALID'
      using errcode = '22023';
  end if;

  select o.* into v_row
  from public.cing_offline_revive_score_outbox o
  where o.score_id = p_score_id
    and o.reward_worker_token = p_worker_token
    and o.reward_status = 'processing'
    and o.reward_locked_until > clock_timestamp()
  for update;

  if not found then
    return query select false, null::text, false, false;
    return;
  end if;

  if p_outcome = 'completed'
    and (
      v_row.reward_applied is distinct from true
      or v_row.reward_challenge_id is null
      or v_row.reward_snapshot_id is null
      or v_row.reward_notification_status is distinct from 'pending'
    )
  then
    raise exception 'REVIVAL_REWARD_ACK_CREDIT_MISSING'
      using errcode = '55000';
  end if;

  if p_outcome = 'skipped'
    and (
      v_row.reward_applied is true
      or nullif(btrim(coalesce(p_reason, '')), '') is null
    )
  then
    raise exception 'REVIVAL_REWARD_ACK_SKIP_INVALID'
      using errcode = '55000';
  end if;

  update public.cing_offline_revive_score_outbox o
  set
    reward_status = p_outcome,
    reward_applied = case
      when p_outcome = 'skipped' then false
      else o.reward_applied
    end,
    reward_processed_at = coalesce(
      o.reward_processed_at,
      clock_timestamp()
    ),
    reward_worker_token = null,
    reward_locked_until = null,
    reward_last_error = case
      when p_outcome = 'skipped'
        then left(btrim(p_reason), 1000)
      else null
    end
  where o.score_id = p_score_id;

  return query select
    true,
    p_outcome,
    p_outcome = 'completed',
    p_outcome = 'completed';
end;
$$;


/*
 * FAIL / RETRY.
 * A committed credit cannot be terminally failed.
 */

create function
public.cing_offline_revive_reward_fail_v1(
  p_score_id bigint,
  p_worker_token uuid,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_score_id is null
    or p_worker_token is null
    or nullif(btrim(coalesce(p_error, '')), '') is null
  then
    raise exception 'REVIVAL_REWARD_FAIL_ARGUMENT_INVALID'
      using errcode = '22023';
  end if;

  update public.cing_offline_revive_score_outbox o
  set
    reward_status = case
      when o.reward_applied is true
        then 'pending'
      when o.reward_attempt_count >= 6
        then 'failed'
      else 'pending'
    end,
    reward_next_attempt_at =
      clock_timestamp() +
      make_interval(
        secs => case
          when o.reward_applied is true then 10
          when o.reward_attempt_count <= 1 then 10
          when o.reward_attempt_count = 2 then 30
          when o.reward_attempt_count = 3 then 120
          when o.reward_attempt_count = 4 then 600
          else 1800
        end
      ),
    reward_locked_until = null,
    reward_worker_token = null,
    reward_last_error = left(p_error, 1000)
  where o.score_id = p_score_id
    and o.reward_worker_token = p_worker_token
    and o.reward_status = 'processing'
    and o.reward_locked_until > clock_timestamp();

  return found;
end;
$$;

revoke all on function
public.cing_offline_revive_reward_ack_v1(
  bigint, uuid, text, text
)
from public, anon, authenticated, service_role;

grant execute on function
public.cing_offline_revive_reward_ack_v1(
  bigint, uuid, text, text
)
to service_role;

revoke all on function
public.cing_offline_revive_reward_fail_v1(
  bigint, uuid, text
)
from public, anon, authenticated, service_role;

grant execute on function
public.cing_offline_revive_reward_fail_v1(
  bigint, uuid, text
)
to service_role;

revoke all on function
public.cing_offline_revive_reward_claim_v1(integer)
from public, anon, authenticated, service_role;

grant execute on function
public.cing_offline_revive_reward_claim_v1(integer)
to service_role;

revoke all on function
public.cing_offline_revive_reward_renew_v1(
  bigint, uuid, integer
)
from public, anon, authenticated, service_role;

grant execute on function
public.cing_offline_revive_reward_renew_v1(
  bigint, uuid, integer
)
to service_role;

commit;
