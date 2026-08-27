begin;

/*
 * ==========================================================
 * CING WALLET — ORDER PAYMENT HANDOFF AUTHORITY V1
 * ==========================================================
 *
 * Purpose:
 * expose one bounded, canonical commerce handoff after the
 * proven Wallet order-payment financial authority succeeds.
 *
 * Financial authority remains exclusively:
 *   cing_wallet_settle_order_payment_atomic(bigint)
 *
 * This wrapper:
 * - accepts payment transaction identity only
 * - invokes the existing atomic debit/settlement authority
 * - re-reads the canonical payment row in the same DB tx
 * - cross-checks the returned Wallet ledger
 * - returns only canonical positive commerce handoff values
 *
 * It never accepts caller-controlled user_id or amount and
 * never mutates Wallet state directly.
 */

create or replace function
public.cing_wallet_settle_order_payment_handoff_atomic(
  p_payment_transaction_id bigint
)
returns table (
  payment_transaction_id bigint,
  transaction_code text,
  settlement_reference text,
  amount bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_transaction
    public.cing_wallet_transactions%rowtype;

  v_payment
    public.payment_transactions%rowtype;

  v_user_id text;
  v_amount bigint;
  v_reference_id text;
begin
  if p_payment_transaction_id is null then
    raise exception
      'CING_WALLET_ORDER_HANDOFF_PAYMENT_ID_REQUIRED'
      using errcode = '22023';
  end if;

  /*
   * Existing V1 authority remains the only financial mutation
   * authority. Its payment-row lock is retained until this outer
   * PostgreSQL transaction completes.
   */
  select *
  into v_wallet_transaction
  from public.cing_wallet_settle_order_payment_atomic(
    p_payment_transaction_id
  );

  if v_wallet_transaction.id is null then
    raise exception
      'CING_WALLET_ORDER_HANDOFF_LEDGER_MISSING'
      using errcode = '55000';
  end if;

  /*
   * Read the same authoritative payment after atomic settlement.
   */
  select *
  into v_payment
  from public.payment_transactions
  where id = p_payment_transaction_id;

  if not found then
    raise exception
      'CING_WALLET_ORDER_HANDOFF_PAYMENT_MISSING'
      using errcode = '55000';
  end if;

  /*
   * Revalidate canonical immutable order-payment semantics.
   */
  if v_payment.payment_purpose <> 'order' then
    raise exception
      'CING_WALLET_ORDER_HANDOFF_PURPOSE_INVALID'
      using errcode = '55000';
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
      'CING_WALLET_ORDER_HANDOFF_METHOD_INVALID'
      using errcode = '55000';
  end if;

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
      'CING_WALLET_ORDER_HANDOFF_PROVIDER_INVALID'
      using errcode = '55000';
  end if;

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
      'CING_WALLET_ORDER_HANDOFF_STATUS_INVALID'
      using errcode = '55000';
  end if;

  if v_payment.settlement_consumed_at is null
    or v_payment.settlement_verified_at is null
    or v_payment.settlement_verification_method
      is distinct from
      'cing_wallet_internal_atomic'
  then
    raise exception
      'CING_WALLET_ORDER_HANDOFF_PROOF_INVALID'
      using errcode = '55000';
  end if;

  v_reference_id :=
    v_payment.id::text;

  if v_payment.settlement_reference
      is distinct from
      v_reference_id
  then
    raise exception
      'CING_WALLET_ORDER_HANDOFF_REFERENCE_INVALID'
      using errcode = '55000';
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
      'CING_WALLET_ORDER_HANDOFF_USER_INVALID'
      using errcode = '55000';
  end if;

  if v_payment.amount is null
     or v_payment.amount <= 0
     or v_payment.amount <>
       trunc(
         v_payment.amount
       )
  then
    raise exception
      'CING_WALLET_ORDER_HANDOFF_AMOUNT_INVALID'
      using errcode = '55000';
  end if;

  begin
    v_amount :=
      v_payment.amount::bigint;
  exception
    when numeric_value_out_of_range then
      raise exception
        'CING_WALLET_ORDER_HANDOFF_AMOUNT_OUT_OF_RANGE'
        using errcode = '22003';
  end;

  /*
   * Cross-check the financial ledger returned by V1.
   *
   * Commerce handoff may never reinterpret an unrelated ledger
   * entry as this payment.
   */
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
      'CING_WALLET_ORDER_HANDOFF_LEDGER_CONFLICT'
      using errcode = '55000';
  end if;

  if btrim(
    coalesce(
      v_payment.transaction_code,
      ''
    )
  ) = ''
  then
    raise exception
      'CING_WALLET_ORDER_HANDOFF_TRANSACTION_CODE_INVALID'
      using errcode = '55000';
  end if;

  /*
   * Positive amount is intentional here:
   *
   * Wallet ledger:
   *   payment = negative mutation
   *
   * Commerce handoff:
   *   order payable amount = positive VND
   */
  payment_transaction_id :=
    v_payment.id;

  transaction_code :=
    btrim(
      v_payment.transaction_code
    );

  settlement_reference :=
    v_reference_id;

  amount :=
    v_amount;

  return next;
end;
$$;


/*
 * Backend-only handoff authority.
 */
revoke all on function
public.cing_wallet_settle_order_payment_handoff_atomic(bigint)
from public;

revoke all on function
public.cing_wallet_settle_order_payment_handoff_atomic(bigint)
from anon;

revoke all on function
public.cing_wallet_settle_order_payment_handoff_atomic(bigint)
from authenticated;

grant execute on function
public.cing_wallet_settle_order_payment_handoff_atomic(bigint)
to service_role;


/*
 * Structural assertions.
 *
 * Keep V1 service_role EXECUTE during this compatibility
 * checkpoint. It will be removed only after production has
 * switched to the bounded handoff RPC.
 */
do $migration$
begin
  if to_regprocedure(
    'public.cing_wallet_settle_order_payment_handoff_atomic(bigint)'
  ) is null then
    raise exception
      'CING_WALLET_ORDER_HANDOFF_AUTHORITY_MISSING';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.cing_wallet_settle_order_payment_handoff_atomic(bigint)',
    'EXECUTE'
  ) then
    raise exception
      'CING_WALLET_ORDER_HANDOFF_SERVICE_ROLE_EXECUTE_MISSING';
  end if;

  if has_function_privilege(
    'anon',
    'public.cing_wallet_settle_order_payment_handoff_atomic(bigint)',
    'EXECUTE'
  ) then
    raise exception
      'CING_WALLET_ORDER_HANDOFF_ANON_EXECUTE_FORBIDDEN';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.cing_wallet_settle_order_payment_handoff_atomic(bigint)',
    'EXECUTE'
  ) then
    raise exception
      'CING_WALLET_ORDER_HANDOFF_AUTHENTICATED_EXECUTE_FORBIDDEN';
  end if;

  if to_regprocedure(
    'public.cing_wallet_settle_order_payment_atomic(bigint)'
  ) is null then
    raise exception
      'CING_WALLET_ORDER_PAYMENT_V1_AUTHORITY_MISSING';
  end if;
end;
$migration$;

commit;
