/*
 * Cing Wallet POS — customer preview store projection V2
 *
 * Customer payment preview must identify the merchant before
 * the customer authorizes a Wallet debit.
 *
 * Merchant identity comes exclusively from the immutable
 * payment-intent store snapshot written at QR creation time.
 *
 * V1 is intentionally preserved. V2 is additive.
 */

create or replace function
public.cing_wallet_get_pos_payment_for_customer_v2(
  p_payment_token_id uuid,
  p_user_id text
)
returns table (
  intent_id uuid,
  payment_token_id uuid,
  bill_reference text,
  amount bigint,
  status text,
  expires_at timestamptz,
  wallet_balance bigint,
  store_id uuid,
  store_code text,
  store_display_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz :=
    clock_timestamp();

  v_intent
    public.cing_wallet_pos_payment_intents%rowtype;

  v_user_id text;
  v_balance bigint;

  v_store_id uuid;
  v_store_code text;
  v_store_display_name text;

begin
  if p_payment_token_id is null then
    raise exception
      'CING_WALLET_POS_TOKEN_REQUIRED'
      using errcode = '22023';
  end if;

  v_user_id :=
    nullif(
      btrim(p_user_id),
      ''
    );

  if v_user_id is null then
    raise exception
      'CING_WALLET_POS_USER_REQUIRED'
      using errcode = '22023';
  end if;

  perform 1
  from public.players
  where user_id = v_user_id;

  if not found then
    raise exception
      'CING_WALLET_USER_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  select i.*
  into v_intent
  from public.cing_wallet_pos_payment_intents i
  where i.payment_token_id =
    p_payment_token_id
  for update;

  if not found then
    raise exception
      'CING_WALLET_POS_PAYMENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_intent.status = 'pending'
     and v_intent.expires_at <= v_now
  then
    update public.cing_wallet_pos_payment_intents as pi
    set
      status = 'expired',
      updated_at = v_now
    where pi.id = v_intent.id
    returning *
    into v_intent;
  end if;

  v_store_id :=
    nullif(
      btrim(
        coalesce(
          v_intent.metadata->>'store_id',
          ''
        )
      ),
      ''
    )::uuid;

  v_store_code :=
    nullif(
      btrim(
        coalesce(
          v_intent.metadata->>'store_code',
          ''
        )
      ),
      ''
    );

  v_store_display_name :=
    nullif(
      btrim(
        coalesce(
          v_intent.metadata->>'store_display_name',
          ''
        )
      ),
      ''
    );

  if v_store_id is null
     or v_store_code is null
     or v_store_display_name is null
  then
    raise exception
      'CING_WALLET_POS_STORE_SNAPSHOT_REQUIRED'
      using errcode = '55000';
  end if;

  select a.balance
  into v_balance
  from public.cing_wallet_accounts a
  where a.user_id = v_user_id;

  v_balance :=
    coalesce(
      v_balance,
      0
    );

  return query
  select
    v_intent.id,
    v_intent.payment_token_id,
    v_intent.bill_reference,
    v_intent.amount,
    v_intent.status,
    v_intent.expires_at,
    v_balance,
    v_store_id,
    v_store_code,
    v_store_display_name;
end;
$$;

revoke all on function
public.cing_wallet_get_pos_payment_for_customer_v2(
  uuid,
  text
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_get_pos_payment_for_customer_v2(
  uuid,
  text
)
to service_role;
