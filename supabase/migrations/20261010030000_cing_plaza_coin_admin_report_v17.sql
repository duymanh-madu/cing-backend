-- CING PLAZA V17: read-only Admin Coin reporting.
-- NOT A REVENUE/TAX DETERMINATION.
-- Apply only after separate authorized migration review.

begin;

create or replace function public.cing_plaza_coin_admin_report_v17(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if p_from is not null
     and p_to is not null
     and p_to <= p_from then
    raise exception 'PLAZA_COIN_INVALID_RANGE';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'PLAZA_COIN_INVALID_LIMIT';
  end if;

  if (p_before_created_at is null)
     <> (p_before_id is null) then
    raise exception 'PLAZA_COIN_INVALID_CURSOR';
  end if;

  with

  -- Canonical Wallet → Coin identity:
  -- idempotency_key = plaza-coin-v16:<member_uuid>:<command_uuid>
  -- reference_type = cing_plaza_coin_v16
  -- reference_id = <command_uuid>
  -- signed Wallet amount must equal negative Coin issue VND.
  wallet_coin as (
    select
      w.id,w.idempotency_key,w.reference_id,
      w.transaction_type,w.amount
    from public.cing_wallet_transactions w
    where w.reference_type='cing_plaza_coin_v16'
  ),
  coin_conversions as (
    select member_id,command_id,price_vnd
    from public.cing_plaza_coin_ledger_v16
    where operation='convert'
  ),
  coin_to_wallet as (
    select
      count(*)::bigint as conversion_count,
      coalesce(sum(c.price_vnd),0)::bigint as converted_vnd,
      count(*) filter (where w.id is null)::bigint as missing_wallet,
      count(*) filter (
        where w.id is not null and (
          w.reference_id is distinct from c.command_id::text
          or w.transaction_type is distinct from 'payment'
          or w.amount is distinct from -c.price_vnd
        )
      )::bigint as wrong_wallet
    from coin_conversions c
    left join wallet_coin w on
      w.idempotency_key=
        'plaza-coin-v16:'||c.member_id::text||':'||c.command_id::text
  ),
  wallet_to_coin as (
    select
      count(*)::bigint as wallet_count,
      coalesce(sum(-w.amount) filter (
        where w.transaction_type='payment' and w.amount<0
      ),0)::bigint as wallet_debit_vnd,
      count(*) filter (
        where c.command_id is null
      )::bigint as orphan_wallet
    from wallet_coin w
    left join coin_conversions c on
      w.reference_id=c.command_id::text
      and w.idempotency_key=
        'plaza-coin-v16:'||c.member_id::text||':'||c.command_id::text
  ),
  wallet_period as (
    select
      -- Cash received into prepaid Wallet.
      -- This is not automatically beverage sales revenue.
      coalesce(sum(w.amount) filter (
        where w.transaction_type='topup'
          and w.amount>0
      ),0)::bigint as wallet_topup_real_vnd,

      -- Promotional credit is tracked separately from cash received.
      coalesce(sum(w.amount) filter (
        where w.transaction_type='topup_promotion'
          and w.amount>0
      ),0)::bigint as wallet_promotion_bonus_vnd,

      -- A Wallet payment must represent a strictly negative debit.
      count(*) filter (
        where w.transaction_type='payment'
          and w.amount>=0
      )::bigint as invalid_payment_count,
      coalesce(sum(-w.amount) filter (
        where w.transaction_type='payment'
          and w.reference_type='cing_plaza_coin_v16'
          and w.amount<0
      ),0)::bigint as coin_wallet_payments_vnd,

      coalesce(sum(-w.amount) filter (
        where w.transaction_type='payment'
          and w.reference_type is distinct from 'cing_plaza_coin_v16'
          and w.amount<0
      ),0)::bigint as other_wallet_payments_vnd,

      count(*) filter (
        where w.transaction_type='payment'
          and w.reference_type is distinct from 'cing_plaza_coin_v16'
      )::bigint as other_wallet_payment_count,

      coalesce(sum(-w.amount) filter (
        where w.transaction_type='payment'
          and w.amount<0
      ),0)::bigint as all_payment_debits_vnd,

      -- Wallet paid an app order, with payment and settlement evidence.
      -- This does not independently prove an iPOS VAT invoice exists.
      coalesce(sum(-w.amount) filter (
        where w.transaction_type='payment'
          and w.amount<0
          and w.reference_type='payment_transaction'
          and p.id is not null
          and p.payment_purpose='order'
          and p.payment_status='paid'
          and p.settlement_verified_at is not null
          and p.settlement_consumed_at is not null
          and p.order_created is true
      ),0)::bigint as verified_order_payments_vnd,

      -- POS debit evidence, separate from iPOS invoice reconciliation.
      coalesce(sum(-w.amount) filter (
        where w.transaction_type='payment'
          and w.amount<0
          and w.reference_type='pos_payment_intent'
          and i.id is not null
          and i.status='paid'
          and i.wallet_transaction_id=w.id
      ),0)::bigint as verified_pos_payments_vnd,

      -- Known non-beverage Game Center payment families.
      coalesce(sum(-w.amount) filter (
        where w.transaction_type='payment'
          and w.amount<0
          and w.reference_type in (
            'game_gift_purchase',
            'revive_credit_purchase',
            'game_play_purchase'
          )
      ),0)::bigint as game_payments_vnd

    from public.cing_wallet_transactions w

    left join public.payment_transactions p
      on w.reference_type='payment_transaction'
      and w.reference_id=p.id::text

    left join public.cing_wallet_pos_payment_intents i
      on w.reference_type='pos_payment_intent'
      and w.reference_id=i.id::text

    where (p_from is null or w.created_at>=p_from)
      and (p_to is null or w.created_at<p_to)
  ),
  lifetime as (
    select
      coalesce(sum(coin_delta) filter (
        where operation = 'convert'
      ), 0)::bigint as issued,
      coalesce(sum(-coin_delta) filter (
        where operation = 'buy_loudspeaker'
      ), 0)::bigint as spent,
      coalesce(sum(price_vnd) filter (
        where operation = 'convert'
      ), 0)::bigint as converted_vnd,
      count(*)::bigint as ledger_count
    from public.cing_plaza_coin_ledger_v16
  ),
  outstanding as (
    select
      coalesce(sum(balance),0)::bigint as coins,
      count(*)::bigint as account_count
    from public.cing_plaza_coin_accounts_v16
  ),
  period as (
    select
      coalesce(sum(coin_delta) filter (
        where operation = 'convert'
      ),0)::bigint as issued,
      coalesce(sum(-coin_delta) filter (
        where operation = 'buy_loudspeaker'
      ),0)::bigint as spent,
      coalesce(sum(price_vnd) filter (
        where operation = 'convert'
      ),0)::bigint as converted_vnd,
      count(*)::bigint as ledger_count
    from public.cing_plaza_coin_ledger_v16
    where (p_from is null or created_at >= p_from)
      and (p_to is null or created_at < p_to)
  ),
  page as (
    select
      l.id,
      l.member_id,
      l.command_id,
      l.operation,
      l.coin_delta,
      l.coin_before,
      l.coin_after,
      l.item_delta,
      l.price_vnd,
      l.created_at,
      w.id as wallet_transaction_id,
      w.transaction_type as wallet_transaction_type,
      w.reference_type as wallet_reference_type,
      w.reference_id as wallet_reference_id,
      w.amount as wallet_amount,
      case
        when l.operation <> 'convert' then 'NOT_APPLICABLE'
        when w.id is null then 'MISSING_WALLET'
        when w.transaction_type = 'payment'
          and w.reference_type = 'cing_plaza_coin_v16'
          and w.reference_id = l.command_id::text
          and w.amount = -l.price_vnd
        then 'MATCHED'
        else 'MISMATCH'
      end as wallet_match_status
    from public.cing_plaza_coin_ledger_v16 l
    left join public.cing_wallet_transactions w
      on w.idempotency_key =
        'plaza-coin-v16:' ||
        l.member_id::text || ':' || l.command_id::text
    where (p_from is null or l.created_at >= p_from)
      and (p_to is null or l.created_at < p_to)
      and (
        p_before_created_at is null
        or (l.created_at,l.id)
           < (p_before_created_at,p_before_id)
      )
    order by l.created_at desc,l.id desc
    limit p_limit + 1
  ),
  numbered as (
    select *,row_number() over (
      order by created_at desc,id desc
    ) as rn
    from page
  )
  select jsonb_build_object(
    'vndPerCoin',1000,
    'lifetime',jsonb_build_object(
      'issued',l.issued,
      'spent',l.spent,
      'convertedVnd',l.converted_vnd,
      'ledgerCount',l.ledger_count
    ),
    'period',jsonb_build_object(
      'issued',p.issued,
      'spent',p.spent,
      'convertedVnd',p.converted_vnd,
      'ledgerCount',p.ledger_count
    ),
    'outstanding',jsonb_build_object(
      'coins',o.coins,
      'accountCount',o.account_count,
      'expectedCoins',l.issued-l.spent,
      'delta',o.coins-(l.issued-l.spent),
      'balanced',o.coins=(l.issued-l.spent)
    ),
    'walletReconciliation',jsonb_build_object(
      'status',case
        when cw.missing_wallet=0
          and cw.wrong_wallet=0
          and wc.orphan_wallet=0
          and cw.conversion_count=wc.wallet_count
          and cw.converted_vnd=wc.wallet_debit_vnd
        then 'MATCHED'
        else 'MISMATCH'
      end,
      'coinConversions',cw.conversion_count,
      'walletCoinPayments',wc.wallet_count,
      'coinConvertedVnd',cw.converted_vnd,
      'walletDebitVnd',wc.wallet_debit_vnd,
      'missingWalletTransactions',cw.missing_wallet,
      'mismatchedWalletTransactions',cw.wrong_wallet,
      'orphanWalletTransactions',wc.orphan_wallet
    ),
    'walletFlowsPeriod',jsonb_build_object(
      'walletTopupRealVnd',wp.wallet_topup_real_vnd,
      'walletPromotionBonusVnd',wp.wallet_promotion_bonus_vnd,
      'invalidWalletPaymentCount',wp.invalid_payment_count,
      'coinWalletPaymentsVnd',wp.coin_wallet_payments_vnd,
      'otherWalletPaymentsVnd',wp.other_wallet_payments_vnd,
      'otherWalletPaymentCount',wp.other_wallet_payment_count,
      'allPaymentDebitsVnd',wp.all_payment_debits_vnd,
      'orderPaymentsVerifiedVnd',wp.verified_order_payments_vnd,
      'posPaymentsVerifiedVnd',wp.verified_pos_payments_vnd,
      'gamePaymentsVnd',wp.game_payments_vnd,
      'unclassifiedPaymentsVnd',
        wp.other_wallet_payments_vnd
        - wp.verified_order_payments_vnd
        - wp.verified_pos_payments_vnd
        - wp.game_payments_vnd,
      'categoryBalanced',
        wp.invalid_payment_count=0
        and wp.all_payment_debits_vnd =
          wp.coin_wallet_payments_vnd
          + wp.other_wallet_payments_vnd,
      'orderEvidenceStatus','PAYMENT_VERIFIED_VAT_UNVERIFIED',
      'posEvidenceStatus','POS_PAID_IPOS_INVOICE_UNVERIFIED',
      'drinkSalesVnd',null,
      'drinkClassificationStatus','UNVERIFIED'
    ),
    'items',coalesce(
      (select jsonb_agg(to_jsonb(x) - 'rn'
        order by x.created_at desc,x.id desc)
       from numbered x where x.rn <= p_limit),
      '[]'::jsonb
    ),
    'nextCursor',
      (select jsonb_build_object(
        'createdAt',x.created_at,
        'id',x.id
      )
       from numbered x
       where x.rn = p_limit
         and exists(select 1 from numbered z
                    where z.rn = p_limit + 1))
  )
  into result
  from lifetime l
  cross join outstanding o
  cross join period p
  cross join coin_to_wallet cw
  cross join wallet_to_coin wc
  cross join wallet_period wp;

  return result;
end;
$$;

revoke all on function
public.cing_plaza_coin_admin_report_v17(
  timestamptz,timestamptz,timestamptz,uuid,integer
) from public,anon,authenticated;

grant execute on function
public.cing_plaza_coin_admin_report_v17(
  timestamptz,timestamptz,timestamptz,uuid,integer
) to service_role;

commit;
