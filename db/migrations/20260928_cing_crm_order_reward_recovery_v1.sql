begin;
/* C4C-B: one-transaction reward recovery. Installs capability only; no worker
   start, no historical backfill, no default-enabled config and no cutover. */
do $pre$
begin
 if to_regclass('public.cing_crm_order_reward_delivery_v1') is null
    or to_regprocedure('public.cing_crm_order_spend_plays_atomic_v1(text,text,bigint)') is null
    or to_regclass('public.cing_crm_order_spend_atomic_cutover_v1') is null then
  raise exception 'C4CB_REQUIRES_C4B_AND_C4CA';
 end if;
end;
$pre$;

/* No application caller may mark a reward delivered by merely changing queue
   status. The sole completion authority is this SECURITY DEFINER RPC. */
revoke update (status,attempts,last_reason,last_attempt_at,next_retry_at,delivered_at)
 on public.cing_crm_order_reward_delivery_v1 from service_role;

create function public.cing_crm_order_reward_recover_batch_v1(
 p_batch_size integer default 5
) returns jsonb language plpgsql security definer set search_path=public
as $recover$
declare
 v_row public.cing_crm_order_reward_delivery_v1%rowtype;
 v_order public.crm_orders%rowtype;
 v_result jsonb;
 v_status text;
 v_reason text;
 v_user text;
 v_attempts integer;
 v_total integer := 0;
 v_awarded integer := 0;
 v_replayed integer := 0;
 v_skipped integer := 0;
 v_review integer := 0;
 v_pending integer := 0;
 v_sqlstate text;
 v_now timestamptz;
begin
 if p_batch_size is null or p_batch_size < 1 or p_batch_size > 20 then
  raise exception 'CRM_REWARD_RECOVERY_BATCH_INVALID' using errcode='22023';
 end if;

 /* SKIP LOCKED is the durable multi-instance claim: the row lock remains
    held through the financial RPC and final queue status in one transaction.
    No persistent processing lease is needed and a crash rolls back both. */
 for v_row in
  select * from public.cing_crm_order_reward_delivery_v1
  where status='pending' and next_retry_at <= clock_timestamp()
  order by next_retry_at,crm_order_id
  for update skip locked limit p_batch_size
 loop
  v_total := v_total + 1;
  v_attempts := v_row.attempts + 1;
  v_now := clock_timestamp();
  v_reason := null;
  v_result := null;
  v_status := 'pending';

  begin
   select * into v_order from public.crm_orders
   where id=v_row.crm_order_id for update;
   if not found then
    v_status := 'review'; v_reason := 'crm_order_missing';
   elsif v_order.processed is distinct from true then
    v_status := 'pending'; v_reason := 'crm_order_not_processed';
   elsif v_order.order_code is distinct from v_row.order_code
       or v_order.user_id is distinct from v_row.user_id
       or v_order.order_amount is distinct from v_row.order_amount then
    v_status := 'review'; v_reason := 'crm_order_snapshot_changed';
   elsif v_row.spend_per_play is null or v_row.spend_per_play <= 0 then
    v_status := 'review'; v_reason := 'crm_threshold_snapshot_invalid';
   else
    v_user := btrim(coalesce(v_row.user_id,''));
    if v_user ~ '^84[0-9]{9}$' then
     v_user := '0'||substr(v_user,3);
    end if;
    if v_user = '' or v_row.order_amount is null or v_row.order_amount <= 0 then
     v_status := 'review'; v_reason := 'crm_reward_identity_invalid';
    else
     v_result := public.cing_crm_order_spend_plays_atomic_v1(
      v_row.order_code,v_user,v_row.order_amount);
     v_status := coalesce(v_result->>'status','review');
     v_reason := v_result->>'reason';
     if v_status not in ('awarded','replayed','skipped','review') then
      v_status := 'review'; v_reason := 'crm_reward_rpc_result_invalid';
     end if;
    end if;
   end if;
  exception when others then
   get stacked diagnostics v_sqlstate = returned_sqlstate;
   /* The nested block rolls back ALL effects of this particular attempt.
      Do not mark an ambiguous exception as delivered. */
   v_status := 'pending';
   v_reason := 'rpc_error_sqlstate_'||v_sqlstate;
  end;

  if v_status = 'pending' and v_attempts >= 6 then
   v_status := 'review';
   v_reason := 'retry_exhausted_'||coalesce(v_reason,'unknown');
  end if;
  update public.cing_crm_order_reward_delivery_v1
  set status=v_status,attempts=v_attempts,last_reason=v_reason,
      last_attempt_at=v_now,
      next_retry_at=case when v_status='pending'
       then v_now + make_interval(mins => least(60,v_attempts*10))
       else next_retry_at end,
      delivered_at=case when v_status in ('awarded','replayed','skipped')
       then v_now else null end
  where crm_order_id=v_row.crm_order_id;

  if v_status='awarded' then v_awarded:=v_awarded+1;
  elsif v_status='replayed' then v_replayed:=v_replayed+1;
  elsif v_status='skipped' then v_skipped:=v_skipped+1;
  elsif v_status='review' then v_review:=v_review+1;
  else v_pending:=v_pending+1;
  end if;
 end loop;
 return jsonb_build_object('checked',v_total,'awarded',v_awarded,
  'replayed',v_replayed,'skipped',v_skipped,
  'review',v_review,'pending',v_pending);
end;
$recover$;
revoke all on function public.cing_crm_order_reward_recover_batch_v1(integer)
 from public,anon,authenticated,service_role;
grant execute on function public.cing_crm_order_reward_recover_batch_v1(integer)
 to service_role;
commit;
