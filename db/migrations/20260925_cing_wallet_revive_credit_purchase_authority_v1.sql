begin;

/*
 * CING GAME CENTER V2
 * WALLET -> REVIVE CREDIT PURCHASE AUTHORITY V1
 *
 * Backend-only RPC.
 * No default price, route activation or automatic purchase.
 * Wallet and Revive Credit mutations share one transaction.
 */

create function
public.cing_wallet_purchase_revive_credits_v1(
  p_user_id text,
  p_quantity integer,
  p_request_id uuid
)

returns table (
  applied boolean,
  request_id uuid,
  wallet_transaction_id uuid,
  credit_transaction_id bigint,
  quantity integer,
  unit_price bigint,
  total_cost bigint,
  wallet_balance_after bigint,
  credit_balance_after integer
)

language plpgsql
security definer
set search_path = public

as $function$

declare
  v_user_id text;
  v_key text;
  v_price bigint;
  v_cost bigint;
  v_wallet public.cing_wallet_transactions%rowtype;
  v_credit public.cing_revive_credit_transactions%rowtype;
  v_credit_result record;
  v_quantity integer;
  v_snapshot_price bigint;
  v_snapshot_cost bigint;
begin

  v_user_id :=
    nullif(btrim(coalesce(p_user_id, '')), '');

  if v_user_id is null then
    raise exception 'REVIVE_PURCHASE_USER_REQUIRED'
      using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'REVIVE_PURCHASE_QUANTITY_INVALID'
      using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception 'REVIVE_PURCHASE_REQUEST_ID_REQUIRED'
      using errcode = '22023';
  end if;

  v_key :=
    'wallet_revive_credit_purchase:user:'
    || v_user_id
    || ':request:'
    || p_request_id::text;

  /*
   * Verify canonical user and establish one Wallet lock
   * before deciding whether this request is new.
   */

  perform 1
  from public.players p
  where p.user_id = v_user_id;

  if not found then
    raise exception 'REVIVE_PURCHASE_PLAYER_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  insert into public.cing_wallet_accounts(user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  perform 1
  from public.cing_wallet_accounts a
  where a.user_id = v_user_id
  for update;

  if not found then
    raise exception 'REVIVE_PURCHASE_WALLET_NOT_FOUND'
      using errcode = '55000';
  end if;

  /*
   * Replay BEFORE reading current price.
   * Always return immutable historical snapshots.
   */

  select *
  into v_wallet
  from public.cing_wallet_transactions wt
  where wt.idempotency_key = v_key;

  if found then

    if v_wallet.user_id <> v_user_id
      or v_wallet.transaction_type <> 'payment'
      or v_wallet.reference_type is distinct from
        'revive_credit_purchase'
      or v_wallet.reference_id is distinct from
        p_request_id::text
    then
      raise exception 'REVIVE_PURCHASE_REPLAY_CONFLICT'
        using errcode = '23505';
    end if;

    begin
      v_quantity :=
        (v_wallet.metadata ->> 'quantity')::integer;

      v_snapshot_price :=
        (v_wallet.metadata ->> 'unit_price')::bigint;

      v_snapshot_cost :=
        (v_wallet.metadata ->> 'total_cost')::bigint;
    exception when others then
      raise exception 'REVIVE_PURCHASE_SNAPSHOT_INVALID'
        using errcode = '55000';
    end;

    if v_quantity is null
      or v_snapshot_price is null
      or v_snapshot_cost is null
      or v_quantity <> p_quantity
      or v_snapshot_price <= 0
      or v_snapshot_cost <= 0
      or v_snapshot_price::numeric
        * v_quantity::numeric
        <> v_snapshot_cost::numeric
      or v_wallet.amount <> -v_snapshot_cost
    then
      raise exception 'REVIVE_PURCHASE_REPLAY_CONFLICT'
        using errcode = '23505';
    end if;

    select *
    into v_credit
    from public.cing_revive_credit_transactions t
    where t.user_id = v_user_id
      and t.reference_type =
        'wallet_revive_credit_purchase'
      and t.reference_id = v_wallet.id::text;

    if not found then
      raise exception 'REVIVE_PURCHASE_CREDIT_LEDGER_MISSING'
        using errcode = '55000';
    end if;

    if v_credit.transaction_type <> 'add'
      or v_credit.amount <> v_quantity
    then
      raise exception 'REVIVE_PURCHASE_CREDIT_LEDGER_CONFLICT'
        using errcode = '55000';
    end if;

    return query select
      false,
      p_request_id,
      v_wallet.id,
      v_credit.id,
      v_quantity,
      v_snapshot_price,
      v_snapshot_cost,
      v_wallet.balance_after,
      v_credit.balance_after;

    return;
  end if;

  /*
   * New purchase: price is owned by PostgreSQL.
   */

  select ac.wallet_revive_credit_price
  into v_price
  from public.app_configs ac
  where ac.id = 1;

  if v_price is null or v_price <= 0 then
    raise exception 'REVIVE_PURCHASE_PRICE_NOT_CONFIGURED'
      using errcode = '55000';
  end if;

  begin
    v_cost := v_price * p_quantity::bigint;
  exception when numeric_value_out_of_range then
    raise exception 'REVIVE_PURCHASE_COST_OVERFLOW'
      using errcode = '22003';
  end;

  if v_cost <= 0 then
    raise exception 'REVIVE_PURCHASE_COST_INVALID'
      using errcode = '55000';
  end if;

  /*
   * Financial mutation and credit grant are atomic.
   * Any error below rolls back the Wallet debit too.
   */

  select *
  into v_wallet
  from public.cing_wallet_apply_mutation_private(
    v_user_id,
    'payment',
    -v_cost,
    v_key,
    'Mua Revive Credit bằng Cing Wallet',
    'revive_credit_purchase',
    p_request_id::text,
    null::text,
    'wallet_revive_credit_purchase',
    null::text,
    jsonb_build_object(
      'source', 'wallet_revive_credit_purchase',
      'request_id', p_request_id,
      'quantity', p_quantity,
      'unit_price', v_price,
      'total_cost', v_cost
    )
  );

  select *
  into v_credit_result
  from public.cing_revive_credit_apply_private_v1(
    v_user_id,
    p_quantity,
    'Mua Revive Credit bằng Cing Wallet',
    'wallet_revive_credit_purchase',
    v_wallet.id::text,
    null::text,
    null::uuid,
    jsonb_build_object(
      'source', 'wallet_revive_credit_purchase',
      'request_id', p_request_id,
      'wallet_transaction_id', v_wallet.id,
      'quantity', p_quantity,
      'unit_price', v_price,
      'total_cost', v_cost
    )
  );

  if v_credit_result.applied is distinct from true
    or v_credit_result.transaction_id is null
    or v_credit_result.balance_after is null
  then
    raise exception 'REVIVE_PURCHASE_CREDIT_GRANT_INVALID'
      using errcode = '55000';
  end if;

  return query select
    true,
    p_request_id,
    v_wallet.id,
    v_credit_result.transaction_id,
    p_quantity,
    v_price,
    v_cost,
    v_wallet.balance_after,
    v_credit_result.balance_after;

end;

$function$;

revoke all
on function
  public.cing_wallet_purchase_revive_credits_v1(
    text, integer, uuid
  )
from public, anon, authenticated, service_role;

grant execute
on function
  public.cing_wallet_purchase_revive_credits_v1(
    text, integer, uuid
  )
to service_role;

commit;
