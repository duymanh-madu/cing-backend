begin;

/*
 * ==========================================================
 * CING WALLET — VERIFIED TOP-UP SETTLEMENT AUTHORITY V1
 * ==========================================================
 *
 * Converts exactly one verified external payment settlement
 * into exactly one Cing Wallet top-up.
 *
 * Authority rules:
 *
 * - caller supplies payment transaction identity only
 * - amount comes exclusively from payment_transactions
 * - user identity comes exclusively from payment_transactions
 * - payment row is locked before financial mutation
 * - payment must be purpose=wallet_topup
 * - payment must already be durably paid + verified
 * - settlement can be consumed at most once
 * - Wallet mutation uses the existing private PostgreSQL
 *   authority; no balance logic is duplicated here
 * - settlement consumption and Wallet credit occur in the
 *   same PostgreSQL transaction
 * - retry after success returns the existing Wallet ledger
 *   row without crediting again
 */


create or replace function
public.cing_wallet_settle_verified_topup_atomic(
  p_payment_transaction_id bigint
)
returns public.cing_wallet_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payment_transactions%rowtype;
  v_wallet_transaction
    public.cing_wallet_transactions%rowtype;

  v_user_id text;
  v_amount bigint;
  v_idempotency_key text;
  v_reference_id text;
begin
  /*
   * The payment row itself is the settlement authority.
   *
   * No amount or user identity is accepted from the caller.
   */
  if p_payment_transaction_id is null then
    raise exception
      'CING_WALLET_TOPUP_PAYMENT_ID_REQUIRED'
      using errcode = '22023';
  end if;


  /*
   * Serialize all settlement attempts for this payment.
   */
  select *
  into v_payment
  from public.payment_transactions
  where id =
    p_payment_transaction_id
  for update;

  if not found then
    raise exception
      'CING_WALLET_TOPUP_PAYMENT_NOT_FOUND'
      using errcode = '22023';
  end if;


  /*
   * Only dedicated Wallet top-up payment sessions may enter
   * this financial authority.
   */
  if v_payment.payment_purpose <>
    'wallet_topup'
  then
    raise exception
      'CING_WALLET_TOPUP_PAYMENT_PURPOSE_INVALID'
      using errcode = '22023';
  end if;


  /*
   * Provider settlement must already be durably successful.
   */
  if v_payment.payment_status <>
    'paid'
  then
    raise exception
      'CING_WALLET_TOPUP_PAYMENT_NOT_PAID'
      using errcode = '55000';
  end if;


  /*
   * Settlement proof is mandatory.
   *
   * payment_transactions constraints already enforce proof
   * completeness when settlement_verified_at is present;
   * this authority nevertheless fails closed explicitly.
   */
  if v_payment.settlement_verified_at is null
    or v_payment.settlement_verification_method is null
    or btrim(
      v_payment.settlement_verification_method
    ) = ''
    or v_payment.settlement_reference is null
    or btrim(
      v_payment.settlement_reference
    ) = ''
  then
    raise exception
      'CING_WALLET_TOPUP_SETTLEMENT_NOT_VERIFIED'
      using errcode = '55000';
  end if;


  /*
   * A Wallet top-up must be a positive whole-VND amount.
   *
   * Do not silently round NUMERIC into BIGINT.
   */
  if v_payment.amount is null
    or v_payment.amount <= 0
    or v_payment.amount <>
      trunc(v_payment.amount)
  then
    raise exception
      'CING_WALLET_TOPUP_AMOUNT_INVALID'
      using errcode = '22023';
  end if;

  begin
    v_amount :=
      v_payment.amount::bigint;
  exception
    when numeric_value_out_of_range then
      raise exception
        'CING_WALLET_TOPUP_AMOUNT_OUT_OF_RANGE'
        using errcode = '22003';
  end;


  v_user_id :=
    nullif(
      btrim(
        v_payment.user_id
      ),
      ''
    );

  if v_user_id is null then
    raise exception
      'CING_WALLET_TOPUP_USER_ID_INVALID'
      using errcode = '22023';
  end if;


  /*
   * Stable financial identity.
   *
   * It is derived solely from the authoritative payment row,
   * so retries cannot mutate amount/user/reference semantics.
   */
  v_reference_id :=
    v_payment.id::text;

  v_idempotency_key :=
    'wallet_topup:payment:'
    || v_reference_id;


  /*
   * Replay after a completed settlement.
   *
   * The payment row lock guarantees that a concurrent second
   * attempt can only enter here after the first transaction
   * commits.
   */
  if v_payment.settlement_consumed_at
    is not null
  then
    select *
    into v_wallet_transaction
    from public.cing_wallet_transactions
    where idempotency_key =
      v_idempotency_key;

    if not found then
      raise exception
        'CING_WALLET_TOPUP_CONSUMED_LEDGER_MISSING'
        using errcode = '55000';
    end if;

    if v_wallet_transaction.user_id <>
      v_user_id
      or
      v_wallet_transaction.transaction_type <>
        'topup'
      or
      v_wallet_transaction.amount <>
        v_amount
      or
      v_wallet_transaction.reference_type
        is distinct from
        'payment_transaction'
      or
      v_wallet_transaction.reference_id
        is distinct from
        v_reference_id
    then
      raise exception
        'CING_WALLET_TOPUP_CONSUMED_LEDGER_CONFLICT'
        using errcode = '55000';
    end if;

    return v_wallet_transaction;
  end if;


  /*
   * Delegate all balance + ledger authority to the existing
   * private Wallet primitive.
   *
   * This function is postgres-owned SECURITY DEFINER, so it
   * may invoke the private primitive while service_role still
   * cannot call that primitive directly.
   */
  select *
  into v_wallet_transaction
  from public.cing_wallet_apply_mutation_private(
    v_user_id,
    'topup',
    v_amount,
    v_idempotency_key,
    'Nạp tiền Cing Wallet',
    'payment_transaction',
    v_reference_id,
    null,
    'payment_settlement',
    null,
    jsonb_build_object(
      'payment_transaction_id',
        v_payment.id,
      'transaction_code',
        v_payment.transaction_code,
      'payment_provider',
        v_payment.payment_provider,
      'payment_method',
        v_payment.payment_method,
      'settlement_reference',
        v_payment.settlement_reference,
      'settlement_verification_method',
        v_payment.settlement_verification_method,
      'settlement_verified_at',
        v_payment.settlement_verified_at
    )
  );


  if v_wallet_transaction.id is null then
    raise exception
      'CING_WALLET_TOPUP_LEDGER_WRITE_FAILED'
      using errcode = '55000';
  end if;


  /*
   * Consume the provider settlement only after the Wallet
   * mutation is durable inside this same PostgreSQL
   * transaction.
   *
   * Any failure below rolls back both the Wallet credit and
   * this consumption marker.
   */
  update public.payment_transactions
  set
    settlement_consumed_at =
      clock_timestamp(),
    updated_at =
      clock_timestamp()
  where id =
      v_payment.id
    and settlement_consumed_at
      is null;

  if not found then
    raise exception
      'CING_WALLET_TOPUP_SETTLEMENT_CONSUME_FAILED'
      using errcode = '55000';
  end if;


  return v_wallet_transaction;
end;
$$;


/*
 * Backend may invoke only this bounded domain authority.
 *
 * Browser/client roles never receive financial mutation
 * execution capability.
 */
revoke all
on function
public.cing_wallet_settle_verified_topup_atomic(
  bigint
)
from public;

revoke all
on function
public.cing_wallet_settle_verified_topup_atomic(
  bigint
)
from anon;

revoke all
on function
public.cing_wallet_settle_verified_topup_atomic(
  bigint
)
from authenticated;

revoke all
on function
public.cing_wallet_settle_verified_topup_atomic(
  bigint
)
from service_role;

grant execute
on function
public.cing_wallet_settle_verified_topup_atomic(
  bigint
)
to service_role;


/*
 * ==========================================================
 * STRUCTURAL ASSERTIONS
 * ==========================================================
 */
do $migration$
declare
  v_oid oid;
  v_definition text;
begin
  v_oid :=
    to_regprocedure(
      'public.cing_wallet_settle_verified_topup_atomic(bigint)'
    );

  if v_oid is null then
    raise exception
      'CING_WALLET_TOPUP_SETTLEMENT_RPC_MISSING';
  end if;

  v_definition :=
    pg_get_functiondef(
      v_oid
    );

  if position(
    'for update'
    in lower(v_definition)
  ) = 0 then
    raise exception
      'CING_WALLET_TOPUP_PAYMENT_LOCK_MISSING';
  end if;

  if position(
    'cing_wallet_apply_mutation_private'
    in v_definition
  ) = 0 then
    raise exception
      'CING_WALLET_TOPUP_PRIVATE_AUTHORITY_MISSING';
  end if;

  if position(
    'settlement_consumed_at'
    in v_definition
  ) = 0 then
    raise exception
      'CING_WALLET_TOPUP_CONSUMPTION_FENCE_MISSING';
  end if;

  if position(
    'wallet_topup:payment:'
    in v_definition
  ) = 0 then
    raise exception
      'CING_WALLET_TOPUP_IDEMPOTENCY_IDENTITY_MISSING';
  end if;
end;
$migration$;

commit;
