begin;

/*
 * CING GAME CENTER V2
 *
 * Score outbox worker authority.
 *
 * service_role may execute these narrow
 * RPCs but cannot directly mutate
 * cing_offline_revive_score_outbox.
 *
 * Every state mutation following claim
 * requires score_id + worker_token +
 * an unexpired processing lease.
 *
 * Does not write game_scores, Wallet,
 * loyalty or revive credits.
 */

/*
 * CLAIM
 *
 * Single-row PostgreSQL claim.
 * Concurrent claims skip locked rows.
 *
 * Expired processing jobs may be
 * reclaimed with a NEW worker token.
 *
 * Stage progress survives reclaim.
 */

create function
  public.cing_offline_revive_score_claim_v1(
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
      'REVIVAL_SCORE_LEASE_INVALID'
      using errcode = '22023';
  end if;

  v_now := clock_timestamp();

  select o.score_id
    into v_score_id
  from public.cing_offline_revive_score_outbox o
  where (
    (
      o.status = 'pending'
      and o.next_attempt_at <= v_now
    )
    or
    (
      o.status = 'processing'
      and o.locked_until <= v_now
    )
  )
  order by
    o.next_attempt_at asc,
    o.created_at asc,
    o.score_id asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update
    public.cing_offline_revive_score_outbox o
  set
    status = 'processing',
    attempt_count = o.attempt_count + 1,
    worker_token = gen_random_uuid(),
    locked_until =
      clock_timestamp() +
      make_interval(secs => p_lease_seconds),
    updated_at = clock_timestamp(),
    last_error = null
  where o.score_id = v_score_id
  returning *
    into v_row;

  return next v_row;
end;
$$;

/*
 * RENEW
 *
 * Never restores an expired lease.
 * A stale worker cannot extend the
 * new worker's lease.
 */

create function
  public.cing_offline_revive_score_renew_v1(
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
      'REVIVAL_SCORE_RENEW_ARGUMENT_INVALID'
      using errcode = '22023';
  end if;

  update
    public.cing_offline_revive_score_outbox o
  set
    locked_until =
      clock_timestamp() +
      make_interval(secs => p_lease_seconds),
    updated_at = clock_timestamp()
  where o.score_id = p_score_id
    and o.worker_token = p_worker_token
    and o.status = 'processing'
    and o.locked_until > clock_timestamp();

  return found;
end;
$$;

/*
 * ACK STAGE
 *
 * Strict progression:
 *
 * analytics -> leaderboard -> top1
 *
 * A completed stage can be ACKed again
 * by the CURRENT worker without changing
 * any result.
 *
 * The final ACK atomically marks the
 * outbox record delivered.
 */

create function
  public.cing_offline_revive_score_ack_stage_v1(
    p_score_id bigint,
    p_worker_token uuid,
    p_stage text
  )
returns table (
  accepted boolean,
  completed boolean,
  analytics_done boolean,
  leaderboard_done boolean,
  top1_done boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row
    public.cing_offline_revive_score_outbox%rowtype;
  v_analytics boolean;
  v_leaderboard boolean;
  v_top1 boolean;
  v_complete boolean;
begin
  if p_score_id is null
     or p_worker_token is null
     or p_stage is null
     or p_stage not in (
       'analytics',
       'leaderboard',
       'top1'
     )
  then
    raise exception
      'REVIVAL_SCORE_ACK_ARGUMENT_INVALID'
      using errcode = '22023';
  end if;

  select *
    into v_row
  from public.cing_offline_revive_score_outbox o
  where o.score_id = p_score_id
    and o.worker_token = p_worker_token
    and o.status = 'processing'
    and o.locked_until > clock_timestamp()
  for update;

  if not found then
    return query
      select false, false,
             false, false, false;
    return;
  end if;

  if (
    p_stage = 'leaderboard'
    and not v_row.analytics_done
  ) or (
    p_stage = 'top1'
    and not v_row.leaderboard_done
  ) then
    raise exception
      'REVIVAL_SCORE_STAGE_ORDER_INVALID'
      using errcode = '23514';
  end if;

  v_analytics :=
    v_row.analytics_done
    or p_stage = 'analytics';

  v_leaderboard :=
    v_row.leaderboard_done
    or p_stage = 'leaderboard';

  v_top1 :=
    v_row.top1_done
    or p_stage = 'top1';

  v_complete :=
    v_analytics
    and v_leaderboard
    and v_top1;

  update
    public.cing_offline_revive_score_outbox o
  set
    analytics_done = v_analytics,
    leaderboard_done = v_leaderboard,
    top1_done = v_top1,
    status = case
      when v_complete then 'delivered'
      else 'processing'
    end,
    delivered_at = case
      when v_complete then clock_timestamp()
      else null
    end,
    locked_until = case
      when v_complete then null
      else o.locked_until
    end,
    worker_token = case
      when v_complete then null
      else o.worker_token
    end,
    last_error = null,
    updated_at = clock_timestamp()
  where o.score_id = p_score_id;

  return query
    select
      true,
      v_complete,
      v_analytics,
      v_leaderboard,
      v_top1;
end;
$$;

/*
 * FAIL / RETRY
 *
 * attempt_count increments at CLAIM,
 * not here. One failed processing
 * attempt therefore counts once.
 *
 * A terminal failure remains visible
 * for operator inspection; it is not
 * silently discarded.
 */

create function
  public.cing_offline_revive_score_fail_v1(
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
     or nullif(
       btrim(coalesce(p_error, '')),
       ''
     ) is null
  then
    raise exception
      'REVIVAL_SCORE_FAIL_ARGUMENT_INVALID'
      using errcode = '22023';
  end if;

  update
    public.cing_offline_revive_score_outbox o
  set
    status = case
      when o.attempt_count >= 6
        then 'failed'
      else 'pending'
    end,
    next_attempt_at =
      clock_timestamp() +
      make_interval(
        secs => case
          when o.attempt_count <= 1
            then 10
          when o.attempt_count = 2
            then 30
          when o.attempt_count = 3
            then 120
          when o.attempt_count = 4
            then 600
          else 1800
        end
      ),
    locked_until = null,
    worker_token = null,
    last_error =
      left(p_error, 1000),
    updated_at = clock_timestamp()
  where o.score_id = p_score_id
    and o.worker_token = p_worker_token
    and o.status = 'processing'
    and o.locked_until > clock_timestamp();

  return found;
end;
$$;

/*
 * No browser execution.
 * service_role can only use the
 * exact four worker RPCs.
 */

revoke all
on function
  public.cing_offline_revive_score_claim_v1(
    integer
  )
from public, anon, authenticated,
     service_role;

grant execute
on function
  public.cing_offline_revive_score_claim_v1(
    integer
  )
to service_role;

revoke all
on function
  public.cing_offline_revive_score_renew_v1(
    bigint, uuid, integer
  )
from public, anon, authenticated,
     service_role;

grant execute
on function
  public.cing_offline_revive_score_renew_v1(
    bigint, uuid, integer
  )
to service_role;

revoke all
on function
  public.cing_offline_revive_score_ack_stage_v1(
    bigint, uuid, text
  )
from public, anon, authenticated,
     service_role;

grant execute
on function
  public.cing_offline_revive_score_ack_stage_v1(
    bigint, uuid, text
  )
to service_role;

revoke all
on function
  public.cing_offline_revive_score_fail_v1(
    bigint, uuid, text
  )
from public, anon, authenticated,
     service_role;

grant execute
on function
  public.cing_offline_revive_score_fail_v1(
    bigint, uuid, text
  )
to service_role;

commit;
