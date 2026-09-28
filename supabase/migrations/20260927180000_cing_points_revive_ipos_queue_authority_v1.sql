begin;
/* Local-only dormant delivery RPC. Applying this SQL later requires explicit authorization. */
alter table public.cing_points_revive_credit_purchases
  add column if not exists ipos_claim_token uuid;

create or replace function public.cing_points_revive_ipos_queue_transition_v1(
  p_action text,
  p_purchase_id uuid,
  p_claim_token uuid,
  p_failure text default null,
  p_batch_size integer default 10
)
returns setof public.cing_points_revive_credit_purchases
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_row public.cing_points_revive_credit_purchases%rowtype;
  v_retry integer;
  v_minutes integer;
begin
  if p_claim_token is null then
    raise exception 'POINTS_REVIVE_QUEUE_CLAIM_TOKEN_REQUIRED' using errcode='22023';
  end if;

  if p_action = 'claim' then
    if p_purchase_id is not null or p_failure is not null or p_batch_size not between 1 and 100 then
      raise exception 'POINTS_REVIVE_QUEUE_CLAIM_INVALID' using errcode='22023';
    end if;
    return query
    with picked as (
      select q.id from public.cing_points_revive_credit_purchases q
      where (
        (q.ipos_sync_status = 'pending' and q.ipos_next_retry_at <= v_now)
        or (q.ipos_sync_status = 'processing' and q.ipos_locked_until < v_now)
      )
      order by q.created_at, q.id
      limit p_batch_size
      for update skip locked
    )
    update public.cing_points_revive_credit_purchases q
       set ipos_sync_status='processing',
           ipos_claim_token=p_claim_token,
           ipos_locked_until=v_now + interval '30 minutes',
           updated_at=v_now
      from picked where q.id=picked.id
    returning q.*;
    return;
  end if;

  if p_action not in ('start','synced','failed') or p_purchase_id is null then
    raise exception 'POINTS_REVIVE_QUEUE_ACTION_INVALID' using errcode='22023';
  end if;

  select q.* into v_row
    from public.cing_points_revive_credit_purchases q
    where q.id=p_purchase_id for update;

  if not found or v_row.ipos_sync_status <> 'processing'
      or v_row.ipos_claim_token is distinct from p_claim_token
      or v_row.ipos_locked_until <= v_now then
    raise exception 'POINTS_REVIVE_QUEUE_OWNER_LOST' using errcode='55000';
  end if;

  if p_action = 'start' then
    update public.cing_points_revive_credit_purchases q
      set ipos_first_attempt_at=coalesce(q.ipos_first_attempt_at,v_now),updated_at=v_now
      where q.id=p_purchase_id returning q.* into v_row;
  elsif p_action = 'synced' then
    update public.cing_points_revive_credit_purchases q
      set ipos_sync_status='synced',ipos_synced_at=v_now,
          ipos_locked_until=null,ipos_claim_token=null,
          ipos_last_error=null,updated_at=v_now
      where q.id=p_purchase_id returning q.* into v_row;
  else
    v_retry := v_row.ipos_retry_count + 1;
    v_minutes := case v_retry when 1 then 1 when 2 then 5
      when 3 then 15 when 4 then 60 when 5 then 360 else 1440 end;
    update public.cing_points_revive_credit_purchases q
      set ipos_sync_status=case when v_retry >= 6 then 'failed' else 'pending' end,
          ipos_retry_count=v_retry,
          ipos_next_retry_at=v_now + pg_catalog.make_interval(mins=>v_minutes),
          ipos_locked_until=null,ipos_claim_token=null,
          ipos_last_error=left(coalesce(p_failure,''),1000),updated_at=v_now
      where q.id=p_purchase_id returning q.* into v_row;
  end if;
  return next v_row;
end;
$fn$;

revoke all on function public.cing_points_revive_ipos_queue_transition_v1(
  text,uuid,uuid,text,integer
) from public,anon,authenticated,service_role;
grant execute on function public.cing_points_revive_ipos_queue_transition_v1(
  text,uuid,uuid,text,integer
) to service_role;
/* Purchase RPC intentionally remains REVOKED. No table UPDATE privileges granted. */
commit;
