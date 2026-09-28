begin;

/*
 * CING GAME CENTER V2 — ADMIN PURCHASE ACTIVITY V1
 * Gross, booked purchase activity, NOT net revenue, VAT or bank settlement.
 * Wallet topups, bonuses, gameplay revive DEBITS and historical V1 plays
 * are excluded. Points are separately reported, never added to Wallet VND.
 * A later reconciliation report must attribute refunds/reversals by original
 * transaction before describing any total as net revenue.
 */
create function public.cing_game_economy_admin_report_v1(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_category text default null,
  p_funding_source text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $function$
declare
  v_result jsonb;
  v_mismatches bigint;
begin
  if p_from is not null and p_to is not null and p_to <= p_from then
    raise exception 'CING_GAME_REPORT_TIME_RANGE_INVALID' using errcode = '22023';
  end if;
  if p_category is not null and p_category not in ('revive_credit', 'gift_charm') then
    raise exception 'CING_GAME_REPORT_CATEGORY_INVALID' using errcode = '22023';
  end if;
  if p_funding_source is not null and p_funding_source not in ('wallet', 'points') then
    raise exception 'CING_GAME_REPORT_FUNDING_INVALID' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'CING_GAME_REPORT_LIMIT_INVALID' using errcode = '22023';
  end if;

  /* Never silently omit a malformed wallet-funded Gift purchase. */
  select count(*) into v_mismatches
  from public.cing_game_gift_purchases g
  left join public.cing_wallet_transactions wt on wt.id = g.wallet_transaction_id
  where g.funding_source = 'wallet'
    and (wt.id is null
      or wt.user_id is distinct from g.sender_user_id
      or wt.transaction_type is distinct from 'payment'
      or wt.reference_type is distinct from 'game_gift_purchase'
      or wt.amount is distinct from -g.price_vnd)
    and (p_from is null or g.created_at >= p_from)
    and (p_to is null or g.created_at < p_to);
  if v_mismatches > 0 then
    raise exception 'CING_GAME_REPORT_WALLET_GIFT_LEDGER_MISMATCH' using errcode = '55000';
  end if;

  with activity as (
    select wt.id::text as purchase_id,
      wt.created_at,
      'revive_credit'::text as category,
      'wallet'::text as funding_source,
      wt.user_id,
      null::text as recipient_user_id,
      null::text as product_name,
      -wt.amount::numeric as wallet_vnd,
      0::numeric as points_used,
      null::text as ipos_sync_status
    from public.cing_wallet_transactions wt
    where wt.transaction_type = 'payment'
      and wt.reference_type = 'revive_credit_purchase'
      and wt.amount < 0

    union all

    select p.id::text, p.created_at,
      'revive_credit'::text, 'points'::text, p.user_id,
      null::text, null::text,
      0::numeric, p.total_points::numeric,
      p.ipos_sync_status
    from public.cing_points_revive_credit_purchases p

    union all

    select g.id::text, g.created_at,
      'gift_charm'::text, 'wallet'::text, g.sender_user_id,
      g.recipient_user_id, g.gift_name,
      g.price_vnd::numeric, 0::numeric,
      g.ipos_sync_status
    from public.cing_game_gift_purchases g
    join public.cing_wallet_transactions wt on wt.id = g.wallet_transaction_id
      and wt.user_id = g.sender_user_id
      and wt.transaction_type = 'payment'
      and wt.reference_type = 'game_gift_purchase'
      and wt.amount = -g.price_vnd
    where g.funding_source = 'wallet'

    union all

    select g.id::text, g.created_at,
      'gift_charm'::text, 'points'::text, g.sender_user_id,
      g.recipient_user_id, g.gift_name,
      0::numeric, g.points_cost::numeric,
      g.ipos_sync_status
    from public.cing_game_gift_purchases g
    where g.funding_source = 'points'
  ), filtered as (
    select * from activity a
    where (p_from is null or a.created_at >= p_from)
      and (p_to is null or a.created_at < p_to)
      and (p_category is null or a.category = p_category)
      and (p_funding_source is null or a.funding_source = p_funding_source)
  ), totals as (
    select count(*) as purchase_count,
      coalesce(sum(wallet_vnd),0)::text as wallet_vnd,
      coalesce(sum(points_used),0)::text as points_used,
      count(*) filter (where category='revive_credit') as revive_purchases,
      count(*) filter (where category='gift_charm') as gift_purchases,
      count(*) filter (where funding_source='points'
        and ipos_sync_status in ('pending','processing','failed')) as points_ipos_not_synced
    from filtered
  ), items as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'purchase_id', purchase_id,
      'created_at', created_at,
      'category', category,
      'funding_source', funding_source,
      'user_id', user_id,
      'recipient_user_id', recipient_user_id,
      'product_name', product_name,
      'wallet_vnd', wallet_vnd::text,
      'points_used', points_used::text,
      'ipos_sync_status', ipos_sync_status
    ) order by created_at desc, purchase_id desc), '[]'::jsonb) as data
    from (
      select * from filtered
      order by created_at desc, purchase_id desc
      limit p_limit
    ) limited
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from',p_from,'to',p_to),
    'filters', jsonb_build_object('category',p_category,'funding_source',p_funding_source),
    'gross_wallet_vnd', t.wallet_vnd,
    'loyalty_points_used', t.points_used,
    'purchase_count', t.purchase_count,
    'revive_purchases', t.revive_purchases,
    'gift_purchases', t.gift_purchases,
    'points_ipos_not_synced', t.points_ipos_not_synced,
    'items', i.data,
    'items_limit', p_limit,
    'is_net_revenue', false
  ) into v_result
  from totals t cross join items i;
  return v_result;
end;
$function$;

revoke all on function public.cing_game_economy_admin_report_v1(
  timestamptz,timestamptz,text,text,integer
) from public, anon, authenticated, service_role;
grant execute on function public.cing_game_economy_admin_report_v1(
  timestamptz,timestamptz,text,text,integer
) to service_role;

commit;
