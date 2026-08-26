begin;

/*
 * ==========================================================
 * CING WALLET — ORDER PAYMENT SETTLEMENT AUTHORITY V1
 * ==========================================================
 *
 * Converts exactly one authoritative order payment intent
 * into exactly one Cing Wallet debit.
 *
 * Authority:
 * - caller supplies payment transaction identity only
 * - user identity comes exclusively from payment_transactions
 * - amount comes exclusively from payment_transactions
 * - payment row is locked before Wallet mutation
 * - payment must be purpose=order
 * - payment method must be cing_wallet
 * - only a pending payment may be newly settled
 * - Wallet mutation reuses the existing private authority
 * - Wallet debit and payment settlement occur in one DB tx
 * - deterministic idempotency makes successful retry safe
 */

create or replace function
public.cing_wallet_settle_order_payment_atomic(
  p_payment_transaction_id bigint
)
returns public.cing_wallet_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payment_transactions%rowtype;
  v_wallet_transaction public.cing_wallet_transactions%rowtype;
  v_user_id text;
  v_amount bigint;
  v_reference_id text;
  v_idempotency_key text;
begin
  if p_payment_transaction_id is null then
    raise exception
      'CING_WALLET_ORDER_PAYMENT_ID_REQUIRED'
      using errcode = '22023';
  end if;

  select *
  into v_payment
  from public.payment_transactions
  where id = p_payment_transaction_id
  for update;

  if not found then
    raise exception
      'CING_WALLET_ORDER_PAYMENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  /*
   * Canonical immutable financial semantics.
   *
   * These validations intentionally happen BEFORE the replay
   * branch. A successful retry must be held to the exact same
   * identity / amount / tender authority as first execution.
   */
  if v_payment.payment_purpose <> 'order' then
    raise exception
      'CING_WALLET_ORDER_PAYMENT_PURPOSE_INVALID'
      using errcode = '22023';
  end if;

  if lower(
    btrim(
      coalesce(
        v_payment.payment_method,
        ''
      )
    )
  ) <> 'cing_wallet'
  then
    raise exception
      'CING_WALLET_ORDER_PAYMENT_METHOD_INVALID'
      using errcode = '22023';
  end if;

  /*
   * Cing Wallet is an internal tender, never an external
   * provider settlement.
   */
  if lower(
    btrim(
      coalesce(
        v_payment.payment_provider,
        ''
      )
    )
  ) <> 'cing_wallet'
  then
    raise exception
      'CING_WALLET_ORDER_PAYMENT_PROVIDER_INVALID'
      using errcode = '22023';
  end if;

  v_user_id :=
    btrim(
      coalesce(
        v_payment.user_id::text,
        ''
      )
    );

  if v_user_id = '' then
    raise exception
      'CING_WALLET_ORDER_PAYMENT_USER_INVALID'
      using errcode = '22023';
  end if;

  /*
   * VND authority is integer-only.
   *
   * Validate NUMERIC before casting to BIGINT so replay can
   * never silently reinterpret a malformed fractional amount.
   */
  if v_payment.amount is null
     or v_payment.amount <= 0
     or v_payment.amount <>
       trunc(
         v_payment.amount
       )
  then
    raise exception
      'CING_WALLET_ORDER_PAYMENT_AMOUNT_INVALID'
      using errcode = '22023';
  end if;

  begin
    v_amount :=
      v_payment.amount::bigint;
  exception
    when numeric_value_out_of_range then
      raise exception
        'CING_WALLET_ORDER_PAYMENT_AMOUNT_OUT_OF_RANGE'
        using errcode = '22003';
  end;

  /*
   * Stable replay identity comes only from the authoritative
   * payment row.
   */
  v_reference_id :=
    v_payment.id::text;

  v_idempotency_key :=
    'wallet_order_payment:payment:'
    || v_reference_id;

  /*
   * Successful retry.
   *
   * A consumed Wallet settlement must itself still carry the
   * canonical durable internal settlement proof. Replay never
   * weakens first-execution authority.
   */
  if v_payment.settlement_consumed_at
    is not null
  then
    if lower(
      btrim(
        coalesce(
          v_payment.payment_status,
          ''
        )
      )
    ) <> 'paid'
    then
      raise exception
        'CING_WALLET_ORDER_PAYMENT_REPLAY_STATUS_INVALID'
        using errcode = '55000';
    end if;

    if v_payment.settlement_verified_at
      is null
      or
      v_payment.settlement_verification_method
        is distinct from
        'cing_wallet_internal_atomic'
      or
      v_payment.settlement_reference
        is distinct from
        v_reference_id
    then
      raise exception
        'CING_WALLET_ORDER_PAYMENT_REPLAY_PROOF_INVALID'
        using errcode = '55000';
    end if;

    select *
    into v_wallet_transaction
    from public.cing_wallet_transactions
    where idempotency_key =
      v_idempotency_key;

    if not found then
      raise exception
        'CING_WALLET_ORDER_PAYMENT_LEDGER_MISSING'
        using errcode = '55000';
    end if;

    if v_wallet_transaction.user_id <>
        v_user_id
      or
      v_wallet_transaction.transaction_type <>
        'payment'
      or
      v_wallet_transaction.amount <>
        -v_amount
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
        'CING_WALLET_ORDER_PAYMENT_LEDGER_CONFLICT'
        using errcode = '55000';
    end if;

    return v_wallet_transaction;
  end if;

  /*
   * A new Wallet settlement starts only from a pending
   * internal Wallet payment intent.
   */
  if lower(
    btrim(
      coalesce(
        v_payment.payment_status,
        ''
      )
    )
  ) <> 'pending'
  then
    raise exception
      'CING_WALLET_ORDER_PAYMENT_STATUS_INVALID'
      using errcode = '55000';
  end if;

  /*
   * A fresh pending Wallet payment must carry no prior
   * payment/settlement proof.
   *
   * PostgreSQL settlement is atomic, so any pre-existing proof
   * on an unconsumed pending row represents inconsistent state.
   * Fail closed BEFORE debiting Wallet.
   */
  if v_payment.paid_at is not null
    or v_payment.settlement_verified_at is not null
    or v_payment.settlement_verification_method is not null
    or v_payment.settlement_reference is not null
  then
    raise exception
      'CING_WALLET_ORDER_PAYMENT_PENDING_PROOF_CONFLICT'
      using errcode = '55000';
  end if;

  /*
   * Existing Wallet primitive owns:
   * - account row locking
   * - non-negative balance invariant
   * - ledger insertion
   * - global idempotency
   * - balance mutation
   */
  select *
  into v_wallet_transaction
  from public.cing_wallet_apply_mutation_private(
    v_user_id,
    'payment',
    -v_amount,
    v_idempotency_key,
    'Thanh toán đơn hàng bằng Cing Wallet',
    'payment_transaction',
    v_reference_id,
    null,
    'wallet_order_payment',
    null,
    jsonb_build_object(
      'payment_transaction_id',
        v_payment.id,
      'transaction_code',
        v_payment.transaction_code,
      'payment_purpose',
        v_payment.payment_purpose,
      'payment_method',
        v_payment.payment_method
    )
  );

  if v_wallet_transaction.id is null then
    raise exception
      'CING_WALLET_ORDER_PAYMENT_MUTATION_FAILED'
      using errcode = '55000';
  end if;

  /*
   * Internal settlement proof.
   * This happens in the same PostgreSQL transaction as debit.
   */
  update public.payment_transactions
  set
    payment_status = 'paid',
    paid_at = clock_timestamp(),
    settlement_verified_at = clock_timestamp(),
    settlement_verification_method =
      'cing_wallet_internal_atomic',
    settlement_reference = v_reference_id,
    settlement_consumed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where id = v_payment.id
    and settlement_consumed_at is null;

  if not found then
    raise exception
      'CING_WALLET_ORDER_PAYMENT_CONSUME_FAILED'
      using errcode = '55000';
  end if;

  return v_wallet_transaction;
end;
$$;


/*
 * Financial authority is backend-only.
 */
revoke all on function
public.cing_wallet_settle_order_payment_atomic(bigint)
from public;

revoke all on function
public.cing_wallet_settle_order_payment_atomic(bigint)
from anon;

revoke all on function
public.cing_wallet_settle_order_payment_atomic(bigint)
from authenticated;

grant execute on function
public.cing_wallet_settle_order_payment_atomic(bigint)
to service_role;


/*
 * Structural assertions.
 */
do $migration$
begin
  if to_regprocedure(
    'public.cing_wallet_settle_order_payment_atomic(bigint)'
  ) is null then
    raise exception
      'CING_WALLET_ORDER_PAYMENT_AUTHORITY_MISSING';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.cing_wallet_settle_order_payment_atomic(bigint)',
    'EXECUTE'
  ) then
    raise exception
      'CING_WALLET_ORDER_PAYMENT_SERVICE_ROLE_EXECUTE_MISSING';
  end if;

  if has_function_privilege(
    'anon',
    'public.cing_wallet_settle_order_payment_atomic(bigint)',
    'EXECUTE'
  ) then
    raise exception
      'CING_WALLET_ORDER_PAYMENT_ANON_EXECUTE_FORBIDDEN';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.cing_wallet_settle_order_payment_atomic(bigint)',
    'EXECUTE'
  ) then
    raise exception
      'CING_WALLET_ORDER_PAYMENT_AUTHENTICATED_EXECUTE_FORBIDDEN';
  end if;
end;
$migration$;

commit;
