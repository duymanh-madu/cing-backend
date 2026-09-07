begin;


/*
 * ==========================================================
 * CING COMMERCE — POINTS-ONLY PAYMENT SETTLEMENT V1
 * ==========================================================
 *
 * Purpose:
 *
 * When canonical loyalty redemption covers the entire payable:
 *
 *   remaining_payable = 0
 *
 * the order must NOT enter Cing Wallet or an external provider.
 *
 * The payment transaction remains the durable commerce funding
 * identity, but amount is exactly zero and funding is represented
 * by the existing point reservation.
 *
 * Caller authority:
 *
 *   payment transaction ID only.
 *
 * PostgreSQL derives and validates:
 *
 * - canonical payment user
 * - purpose
 * - payment method/provider
 * - zero monetary amount
 * - canonical frozen points_used
 * - canonical frozen points_discount
 * - canonical frozen pre_points_payable
 * - matching point reservation
 *
 * This RPC does NOT:
 *
 * - debit players.total_points again
 * - create point_transactions
 * - create the order
 * - consume the point reservation
 * - touch Cing Wallet
 * - call iPOS
 *
 * Reservation consumption remains owned by
 * cing_commerce_apply_order_points_deduct_v1() after the durable
 * paid order has been materialized.
 */


create or replace function
public.cing_commerce_settle_points_only_payment_v1(
  p_payment_transaction_id bigint
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = public
as $$
declare

  v_payment
    public.payment_transactions%rowtype;

  v_reservation
    public.commerce_point_reservations%rowtype;

  v_points_used integer;

  v_points_discount bigint;

  v_pre_points_payable bigint;

  v_now timestamptz :=
    clock_timestamp();

  v_reference text;

begin

  if p_payment_transaction_id is null then

    raise exception
      'COMMERCE_POINTS_ONLY_PAYMENT_ID_REQUIRED'
      using errcode = '22023';

  end if;


  /*
   * Lock order remains:
   *
   * payment -> reservation
   */
  select p.*
  into v_payment
  from public.payment_transactions p
  where p.id =
    p_payment_transaction_id
  for update;


  if not found then

    raise exception
      'COMMERCE_POINTS_ONLY_PAYMENT_NOT_FOUND'
      using errcode = 'P0002';

  end if;


  if v_payment.payment_purpose
    is distinct from 'order'
  then

    raise exception
      'COMMERCE_POINTS_ONLY_PURPOSE_INVALID'
      using errcode = '55000';

  end if;


  if lower(
    btrim(
      coalesce(
        v_payment.payment_method,
        ''
      )
    )
  ) <> 'points'
  then

    raise exception
      'COMMERCE_POINTS_ONLY_METHOD_INVALID'
      using errcode = '55000';

  end if;


  if lower(
    btrim(
      coalesce(
        v_payment.payment_provider,
        ''
      )
    )
  ) <> 'internal'
  then

    raise exception
      'COMMERCE_POINTS_ONLY_PROVIDER_INVALID'
      using errcode = '55000';

  end if;


  /*
   * Points-only means exactly zero monetary rail amount.
   */
  if v_payment.amount is null
    or v_payment.amount <> 0
  then

    raise exception
      'COMMERCE_POINTS_ONLY_AMOUNT_INVALID'
      using errcode = '22023';

  end if;


  if jsonb_typeof(
    v_payment.cart_snapshot
  ) is distinct from 'object'
  then

    raise exception
      'COMMERCE_POINTS_ONLY_SNAPSHOT_INVALID'
      using errcode = '55000';

  end if;


  begin

    v_points_used :=
      (
        v_payment.cart_snapshot
        ->> 'points_used'
      )::integer;

    v_points_discount :=
      (
        v_payment.cart_snapshot
        ->> 'points_discount'
      )::bigint;

    v_pre_points_payable :=
      (
        v_payment.cart_snapshot
        ->> 'pre_points_payable'
      )::bigint;

  exception

    when
      invalid_text_representation
      or numeric_value_out_of_range
    then

      raise exception
        'COMMERCE_POINTS_ONLY_SNAPSHOT_NUMERIC_INVALID'
        using errcode = '22023';

  end;


  if v_points_used is null
    or v_points_used <= 0
  then

    raise exception
      'COMMERCE_POINTS_ONLY_POINTS_INVALID'
      using errcode = '55000';

  end if;


  if v_points_discount is null
    or v_points_discount <= 0
  then

    raise exception
      'COMMERCE_POINTS_ONLY_DISCOUNT_INVALID'
      using errcode = '55000';

  end if;


  if v_pre_points_payable is null
    or v_pre_points_payable <= 0
  then

    raise exception
      'COMMERCE_POINTS_ONLY_PREPAYABLE_INVALID'
      using errcode = '55000';

  end if;


  /*
   * Full coverage must be exact.
   */
  if v_points_discount <>
    v_pre_points_payable
  then

    raise exception
      'COMMERCE_POINTS_ONLY_COVERAGE_INVALID'
      using errcode = '55000';

  end if;


  select r.*
  into v_reservation
  from public.commerce_point_reservations r
  where r.payment_transaction_id =
    v_payment.id
  for update;


  if not found then

    raise exception
      'COMMERCE_POINTS_ONLY_RESERVATION_REQUIRED'
      using errcode = '55000';

  end if;


  if v_reservation.user_id
      is distinct from
        v_payment.user_id
    or v_reservation.points
      is distinct from
        v_points_used
  then

    raise exception
      'COMMERCE_POINTS_ONLY_RESERVATION_CONFLICT'
      using errcode = '55000';

  end if;


  if v_reservation.status = 'released' then

    raise exception
      'COMMERCE_POINTS_ONLY_RESERVATION_RELEASED'
      using errcode = '55000';

  end if;


  /*
   * Durable replay.
   *
   * A previously paid points-only payment is accepted only if
   * its internal settlement proof is immutable and complete.
   */
  v_reference :=
    v_payment.id::text;


  if v_payment.payment_status = 'paid' then

    if
      v_payment.settlement_verified_at
        is null
      or v_payment.settlement_verification_method
        is distinct from
          'commerce_points_internal_atomic'
      or v_payment.settlement_reference
        is distinct from
          v_reference
    then

      raise exception
        'COMMERCE_POINTS_ONLY_REPLAY_PROOF_INVALID'
        using errcode = '55000';

    end if;


    if v_reservation.status
      not in (
        'reserved',
        'consumed'
      )
    then

      raise exception
        'COMMERCE_POINTS_ONLY_REPLAY_RESERVATION_INVALID'
        using errcode = '55000';

    end if;


    return v_payment;

  end if;


  /*
   * First execution must still be an untouched pending payment.
   */
  if v_payment.payment_status
      is distinct from 'pending'
    or v_payment.settlement_verified_at
      is not null
    or v_payment.settlement_reference
      is not null
    or v_payment.settlement_consumed_at
      is not null
    or v_payment.order_created
      is distinct from false
    or v_payment.order_id
      is not null
  then

    raise exception
      'COMMERCE_POINTS_ONLY_PAYMENT_STATE_INVALID'
      using errcode = '55000';

  end if;


  if v_reservation.status
    is distinct from 'reserved'
  then

    raise exception
      'COMMERCE_POINTS_ONLY_RESERVATION_STATE_INVALID'
      using errcode = '55000';

  end if;


  update public.payment_transactions
  set
    payment_status =
      'paid',

    paid_at =
      coalesce(
        paid_at,
        v_now
      ),

    settlement_verified_at =
      v_now,

    settlement_verification_method =
      'commerce_points_internal_atomic',

    settlement_reference =
      v_reference,

    updated_at =
      v_now

  where id =
    v_payment.id

  returning *
  into v_payment;


  return v_payment;

end;
$$;


/*
 * Browser/client roles never receive financial execution.
 */
revoke all on function
public.cing_commerce_settle_points_only_payment_v1(
  bigint
)
from public;

revoke all on function
public.cing_commerce_settle_points_only_payment_v1(
  bigint
)
from anon;

revoke all on function
public.cing_commerce_settle_points_only_payment_v1(
  bigint
)
from authenticated;

grant execute on function
public.cing_commerce_settle_points_only_payment_v1(
  bigint
)
to service_role;


commit;
