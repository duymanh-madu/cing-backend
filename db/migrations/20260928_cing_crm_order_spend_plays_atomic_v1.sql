begin;
/* CING 4A.11-C4B: CRM/iPOS historical game-play authority.
   Installs a capability only. No data migration / writer-fence closure.
   CRM processed flag is an existing award-admission criterion, NOT
   independent proof of payment. No historical ambiguous reward is regranted. */
create table public.cing_crm_order_spend_atomic_cutover_v1 (
 singleton boolean primary key default true check (singleton is true),
 installed_at timestamptz not null default clock_timestamp()
);
insert into public.cing_crm_order_spend_atomic_cutover_v1(singleton)
 values (true);
revoke all on table public.cing_crm_order_spend_atomic_cutover_v1
 from public,anon,authenticated,service_role;
create or replace function public.cing_crm_order_spend_plays_atomic_v1(
 p_order_code text, p_user_id text, p_claimed_amount bigint
) returns jsonb language plpgsql security definer set search_path = public
as $fn$
declare
 v_order public.crm_orders%rowtype;
 v_player public.players%rowtype;
 v_ledger public.game_play_transactions%rowtype;
 v_code text := btrim(coalesce(p_order_code,''));
 v_user text := btrim(coalesce(p_user_id,''));
 v_owner text;
 v_ref text;
 v_threshold bigint;
 v_plays_numeric numeric;
 v_plays integer;
 v_before integer;
 v_after integer;
 v_spend_after integer;
 v_now timestamptz := clock_timestamp();
 v_ledger_count integer;
 v_event_count integer;
 v_installed_at timestamptz;
begin
 if v_code = '' or v_user = '' or p_claimed_amount is null or p_claimed_amount <= 0 then
  raise exception 'CRM_PLAY_AWARD_INPUT_INVALID' using errcode='22023';
 end if;
 /* Caller cannot invent order ID, owner, amount, eligibility or price. */
 select * into v_order from public.crm_orders where order_code=v_code for update;
 if not found then
  return jsonb_build_object('status','review','reason','crm_order_missing','order_code',v_code);
 end if;
 v_owner := btrim(coalesce(v_order.user_id,''));
 if v_owner ~ '^84[0-9]{9}$' then v_owner := '0'||substr(v_owner,3); end if;
 if v_owner <> v_user then
  raise exception 'CRM_PLAY_AWARD_OWNER_MISMATCH' using errcode='42501';
 end if;
 if v_order.order_amount is null or v_order.order_amount <= 0
    or v_order.order_amount <> p_claimed_amount then
  return jsonb_build_object('status','review','reason','crm_amount_mismatch','order_code',v_code);
 end if;
 if v_order.processed is distinct from true then
  return jsonb_build_object('status','review','reason','crm_order_not_processed','order_code',v_code);
 end if;
 /* Existing CRM rows have no immutable award-threshold snapshot.
    Never recalculate a pre-install order at the current price. */
 select installed_at into v_installed_at
 from public.cing_crm_order_spend_atomic_cutover_v1 where singleton is true;
 if v_installed_at is null then
  raise exception 'CRM_PLAY_AWARD_INSTALLATION_GATE_MISSING' using errcode='55000';
 end if;
 if v_order.created_at is null or v_order.created_at < v_installed_at then
  return jsonb_build_object('status','review','reason','historical_threshold_unverified','order_code',v_code);
 end if;
 /* Canonical app Commerce orders are exclusively owned by their
    payment-verified commerce RPC, even when its game effect is pending. */
 if exists (select 1 from public.orders o where o.order_code=v_code) then
  return jsonb_build_object('status','review','reason','commerce_order_authority','order_code',v_code);
 end if;
 v_ref := 'crm_orders:'||v_order.id::text;

 /* Commerce ledger and CRM ledger cannot both award the same order_code.
    A non-C4B historical ledger is review-only, never auto-replayed. */
 select count(*) into v_ledger_count from public.game_play_transactions t
 where t.reference_type='order_spending'
   and (t.reference_id=v_ref or t.metadata->>'order_code'=v_code);
 if v_ledger_count > 1 then
  return jsonb_build_object('status','review','reason','multiple_order_ledgers','order_code',v_code);
 end if;
 if v_ledger_count=1 then
  select * into v_ledger from public.game_play_transactions t
  where t.reference_type='order_spending'
    and (t.reference_id=v_ref or t.metadata->>'order_code'=v_code)
  limit 1;
  if v_ledger.reference_id is distinct from v_ref
     or v_ledger.user_id is distinct from v_user
     or v_ledger.transaction_type is distinct from 'add'
     or v_ledger.metadata->>'authority' is distinct from 'crm_order_spend_atomic_v1'
     or v_ledger.metadata->>'order_code' is distinct from v_code
     or v_ledger.metadata->>'order_amount' is distinct from v_order.order_amount::text then
   return jsonb_build_object('status','review','reason','historical_or_conflicting_ledger','order_code',v_code);
  end if;
  select count(*) into v_event_count from public.analytics_events e
  where e.event_name='plays_added'
    and e.user_id=v_user
    and e.event_data->>'source'='order_spending'
    and e.event_data->>'order_code'=v_code;
  if v_event_count <> 1 then
   return jsonb_build_object('status','review','reason','ledger_projection_mismatch','order_code',v_code);
  end if;
  return jsonb_build_object('status','replayed','order_code',v_code,
    'plays',v_ledger.amount,'balance_after',v_ledger.balance_after,'ledger_id',v_ledger.id);
 end if;

 /* Legacy plays_added telemetry may have been written BEFORE balance.
    It is not evidence of successful entitlement delivery. */
 select count(*) into v_event_count from public.analytics_events e
 where e.event_name='plays_added'
   and e.event_data->>'source'='order_spending'
   and e.event_data->>'order_code'=v_code;
 if v_event_count > 0 then
  return jsonb_build_object('status','review','reason','legacy_analytics_ambiguous','order_code',v_code);
 end if;

 select c.spend_per_play::bigint into v_threshold
 from public.app_configs c where c.id=1;
 if v_threshold is null or v_threshold <= 0 then
  raise exception 'CRM_PLAY_AWARD_THRESHOLD_INVALID' using errcode='55000';
 end if;
 v_plays_numeric := floor(v_order.order_amount::numeric/v_threshold::numeric);
 if v_plays_numeric > 2147483647 then
  raise exception 'CRM_PLAY_AWARD_OVERFLOW' using errcode='22003';
 end if;
 if v_plays_numeric <= 0 then
  return jsonb_build_object('status','skipped','reason','below_threshold','order_code',v_code);
 end if;
 v_plays := v_plays_numeric::integer;
 select * into v_player from public.players p where p.user_id=v_user for update;
 if not found then raise exception 'CRM_PLAY_AWARD_PLAYER_MISSING' using errcode='P0002'; end if;

 /* Recheck legacy telemetry after taking the shared player lock. */
 select count(*) into v_event_count from public.analytics_events e
 where e.event_name='plays_added'
   and e.event_data->>'source'='order_spending'
   and e.event_data->>'order_code'=v_code;
 if v_event_count > 0 then
  return jsonb_build_object('status','review','reason','legacy_analytics_ambiguous','order_code',v_code);
 end if;
 v_before := coalesce(v_player.game_plays,0);
 if v_before < 0 or coalesce(v_player.plays_from_spend,0)<0
    or v_before::bigint+v_plays > 2147483647
    or coalesce(v_player.plays_from_spend,0)::bigint+v_plays > 2147483647 then
  raise exception 'CRM_PLAY_AWARD_BALANCE_OVERFLOW' using errcode='22003';
 end if;
 update public.players p set
  game_plays=coalesce(p.game_plays,0)+v_plays,
  plays_from_spend=coalesce(p.plays_from_spend,0)+v_plays
 where p.user_id=v_user
 returning p.game_plays,p.plays_from_spend into v_after,v_spend_after;
 if v_after is distinct from v_before+v_plays then
  raise exception 'CRM_PLAY_AWARD_BALANCE_INVARIANT' using errcode='55000';
 end if;
 insert into public.game_play_transactions
 (user_id,transaction_type,amount,balance_before,balance_after,reason,
  reference_type,reference_id,metadata,created_at)
 values (v_user,'add',v_plays,v_before,v_after,
  format('Tiêu dùng %sđ — đơn %s',v_order.order_amount,v_code),
  'order_spending',v_ref,
  jsonb_build_object('authority','crm_order_spend_atomic_v1','crm_order_id',v_order.id,
   'order_code',v_code,'order_amount',v_order.order_amount,
   'spend_per_play',v_threshold,'plays_from_spend_after',v_spend_after),v_now)
 returning * into v_ledger;
 insert into public.analytics_events
 (user_id,event_name,event_data,metadata,created_at)
 values (v_user,'plays_added',jsonb_build_object(
  'amount',v_plays,'reason',format('Tiêu dùng %sđ — đơn %s',v_order.order_amount,v_code),
  'source','order_spending','order_code',v_code,'order_amount',v_order.order_amount,
  'new_total',v_after,'spend_per_play',v_threshold),
 jsonb_build_object('reference_type','order_spending','reference_id',v_ref,
  'crm_order_id',v_order.id),v_now);
 return jsonb_build_object('status','awarded','order_code',v_code,'plays',v_plays,
  'balance_after',v_after,'plays_from_spend_after',v_spend_after,'ledger_id',v_ledger.id);
end;
$fn$;
revoke all on function public.cing_crm_order_spend_plays_atomic_v1(text,text,bigint)
 from public,anon,authenticated,service_role;
grant execute on function public.cing_crm_order_spend_plays_atomic_v1(text,text,bigint)
 to service_role;
commit;
