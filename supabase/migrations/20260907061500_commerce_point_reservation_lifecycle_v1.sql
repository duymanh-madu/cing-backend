begin;


/*
 * ==========================================================
 * CING COMMERCE — POINT RESERVATION LIFECYCLE V1
 * ==========================================================
 *
 * Phase 3B reserves points by immediately decreasing
 * players.total_points.
 *
 * This migration adds:
 *
 *   1. release authority
 *      - restores held points exactly once when payment has
 *        durably failed or expired
 *
 *   2. reservation-aware paid-order deduction authority
 *      - consumes an existing reservation without decreasing
 *        players.total_points a second time
 *      - writes the permanent point_transactions deduction
 *      - preserves the legacy non-reservation path unchanged
 *
 * Permanent point ledger semantics:
 *
 *   reserve  -> no point_transactions row
 *   release  -> no point_transactions row
 *   consume  -> exactly one permanent 'deduct' row
 */


/* ----------------------------------------------------------
 * RELEASE A RESERVED PAYMENT
 *
 * Caller supplies payment identity only.
 *
 * Release is intentionally conservative:
 *
 * - payment_status = failed
 *   OR
 * - payment remains pending but expired_at <= now
 *
 * A paid/verified/consumed settlement can never release.
 * ---------------------------------------------------------- */

create or replace function
public.cing_commerce_release_payment_points_v1(
  p_payment_transaction_id bigint,
  p_release_reason text default null
)
returns table (

  payment_transaction_id bigint,

  user_id text,

  points_released integer,

  balance_before integer,

  balance_after integer,

  reservation_status text,

  replayed boolean

)
language plpgsql
security definer
set search_path = public
as $$
declare

  v_payment
    public.payment_transactions%rowtype;

  v_reservation
    public.commerce_point_reservations%rowtype;

  v_player
    public.players%rowtype;

  v_balance_numeric numeric;

  v_before integer;
  v_after integer;

  v_reason text;

  v_now timestamptz :=
    clock_timestamp();

begin

  if p_payment_transaction_id is null then
    raise exception
      'COMMERCE_POINT_RELEASE_PAYMENT_REQUIRED'
      using errcode = '22023';
  end if;


  /*
   * Same lock order as reservation creation:
   *
   * payment -> reservation -> player
   */
  select p.*
  into v_payment
  from public.payment_transactions p
  where p.id =
    p_payment_transaction_id
  for update;

  if not found then
    raise exception
      'COMMERCE_POINT_RELEASE_PAYMENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;


  if v_payment.payment_purpose
    is distinct from 'order'
  then
    raise exception
      'COMMERCE_POINT_RELEASE_PURPOSE_INVALID'
      using errcode = '55000';
  end if;


  select r.*
  into v_reservation
  from public.commerce_point_reservations r
  where r.payment_transaction_id =
    v_payment.id
  for update;

  /*
   * No reservation means zero points were reserved.
   * Release is therefore a bounded no-op.
   */
  if not found then

    return query
    select
      v_payment.id,
      nullif(
        btrim(
          coalesce(
            v_payment.user_id,
            ''
          )
        ),
        ''
      ),
      0,
      null::integer,
      null::integer,
      'not_required'::text,
      false;

    return;

  end if;


  /*
   * Durable replay.
   */
  if v_reservation.status = 'released' then

    return query
    select
      v_reservation.payment_transaction_id,
      v_reservation.user_id,
      v_reservation.points,
      null::integer,
      null::integer,
      v_reservation.status,
      true;

    return;

  end if;


  if v_reservation.status = 'consumed' then
    raise exception
      'COMMERCE_POINT_RELEASE_ALREADY_CONSUMED'
      using errcode = '55000';
  end if;


  if v_reservation.status
    is distinct from 'reserved'
  then
    raise exception
      'COMMERCE_POINT_RELEASE_STATE_INVALID'
      using errcode = '55000';
  end if;


  if
    v_payment.payment_status = 'paid'
    or v_payment.settlement_verified_at
      is not null
    or v_payment.settlement_consumed_at
      is not null
    or v_payment.order_created is true
  then
    raise exception
      'COMMERCE_POINT_RELEASE_PAYMENT_ALREADY_SETTLED'
      using errcode = '55000';
  end if;


  /*
   * Fail closed unless payment can no longer legitimately
   * complete.
   */
  if not (
    v_payment.payment_status = 'failed'
    or (
      v_payment.payment_status = 'pending'
      and v_payment.expired_at is not null
      and v_payment.expired_at <= v_now
    )
  ) then
    raise exception
      'COMMERCE_POINT_RELEASE_PAYMENT_NOT_TERMINAL'
      using errcode = '55000';
  end if;


  select p.*
  into v_player
  from public.players p
  where p.user_id =
    v_reservation.user_id
  for update;

  if not found then
    raise exception
      'COMMERCE_POINT_RELEASE_PLAYER_NOT_FOUND'
      using errcode = 'P0002';
  end if;


  v_balance_numeric :=
    coalesce(
      v_player.total_points,
      0
    );


  if
    v_balance_numeric <>
      trunc(v_balance_numeric)
    or v_balance_numeric < 0
    or v_balance_numeric >
      2147483647
  then
    raise exception
      'COMMERCE_POINT_RELEASE_BALANCE_INVALID'
      using errcode = '55000';
  end if;


  v_before :=
    v_balance_numeric::integer;


  if
    v_before >
      2147483647 -
        v_reservation.points
  then
    raise exception
      'COMMERCE_POINT_RELEASE_BALANCE_OVERFLOW'
      using errcode = '22003';
  end if;


  v_after :=
    v_before +
    v_reservation.points;


  update public.players p
  set total_points =
    v_after
  where p.user_id =
    v_reservation.user_id;


  v_reason :=
    nullif(
      btrim(
        coalesce(
          p_release_reason,
          ''
        )
      ),
      ''
    );


  update public.commerce_point_reservations r
  set
    status =
      'released',

    released_at =
      v_now,

    release_reason =
      coalesce(
        v_reason,
        case
          when v_payment.payment_status =
            'failed'
          then
            'payment_failed'

          else
            'payment_expired'
        end
      ),

    metadata =
      coalesce(
        r.metadata,
        '{}'::jsonb
      )
      ||
      jsonb_build_object(
        'released_balance_before',
          v_before,
        'released_balance_after',
          v_after,
        'released_at',
          v_now
      )

  where r.payment_transaction_id =
    v_payment.id
    and r.status =
      'reserved';

  if not found then
    raise exception
      'COMMERCE_POINT_RELEASE_CONCURRENT_STATE_CHANGED'
      using errcode = '40001';
  end if;


  return query
  select
    v_payment.id,
    v_reservation.user_id,
    v_reservation.points,
    v_before,
    v_after,
    'released'::text,
    false;

end;
$$;


/* ----------------------------------------------------------
 * RESERVATION-AWARE PAID ORDER POINT DEDUCT
 *
 * API signature remains unchanged so existing
 * paidOrderSettlementProcessor needs no alternate authority.
 *
 * New orders with reservation:
 *
 *   reservation already decreased players.total_points
 *   -> consume hold
 *   -> write permanent deduct ledger
 *   -> no second player deduction
 *
 * Legacy orders without reservation:
 *
 *   preserve prior V1 behavior.
 * ---------------------------------------------------------- */

create or replace function
public.cing_commerce_apply_order_points_deduct_v1(
  p_order_id bigint
)
returns table (

  order_id bigint,

  user_id text,

  points_deducted integer,

  balance_before integer,

  balance_after integer,

  applied boolean

)
language plpgsql
security definer
set search_path = public
as $$
declare

  v_order
    public.orders%rowtype;

  v_payment
    public.payment_transactions%rowtype;

  v_reservation
    public.commerce_point_reservations%rowtype;

  v_player
    public.players%rowtype;

  v_user_id text;

  v_points integer;

  v_balance_numeric numeric;

  v_before integer;
  v_after integer;

  v_existing
    public.point_transactions%rowtype;

  /*
   * Never use ambient PL/pgSQL FOUND to decide whether the
   * reservation path exists.
   *
   * FOUND is session-local function state from the immediately
   * preceding SQL statement and can remain true when the
   * payment_transaction_id branch is skipped entirely.
   */
  v_has_reservation boolean :=
    false;

  v_now timestamptz :=
    clock_timestamp();

begin

  if p_order_id is null then
    raise exception
      'COMMERCE_POINT_DEDUCT_ORDER_REQUIRED'
      using errcode = '22023';
  end if;


  /*
   * Canonical paid order is authoritative.
   */
  select o.*
  into v_order
  from public.orders o
  where o.id =
    p_order_id
  for update;

  if not found then
    raise exception
      'COMMERCE_POINT_DEDUCT_ORDER_NOT_FOUND'
      using errcode = 'P0002';
  end if;


  if v_order.payment_status
    is distinct from 'paid'
  then
    raise exception
      'COMMERCE_POINT_DEDUCT_ORDER_NOT_PAID'
      using errcode = '55000';
  end if;


  v_user_id :=
    nullif(
      btrim(
        coalesce(
          v_order.customer_phone,
          v_order.user_id,
          ''
        )
      ),
      ''
    );

  if v_user_id is null then
    raise exception
      'COMMERCE_POINT_DEDUCT_USER_MISSING'
      using errcode = '55000';
  end if;


  begin

    if v_order.points_used is null then
      v_points := 0;

    elsif
      v_order.points_used <>
        trunc(v_order.points_used)
      or v_order.points_used < 0
      or v_order.points_used >
        2147483647
    then
      raise exception
        'COMMERCE_POINT_DEDUCT_AMOUNT_INVALID'
        using errcode = '55000';

    else
      v_points :=
        v_order.points_used::integer;
    end if;

  exception
    when numeric_value_out_of_range
    then
      raise exception
        'COMMERCE_POINT_DEDUCT_AMOUNT_INVALID'
        using errcode = '55000';
  end;


  if v_points = 0 then

    return query
    select
      v_order.id,
      v_user_id,
      0,
      null::integer,
      null::integer,
      false;

    return;

  end if;


  /*
   * Preserve exact historical V1 forensic fence.
   */
  if
    (
      v_order.id = 139
      and v_points = 5
    )
    or
    (
      v_order.id = 185
      and v_points = 30
    )
  then

    return query
    select
      v_order.id,
      v_user_id,
      v_points,
      null::integer,
      null::integer,
      false;

    return;

  end if;


  /*
   * Permanent ledger replay is authoritative regardless of
   * whether deduction originated from reservation or legacy.
   */
  select pt.*
  into v_existing
  from public.point_transactions pt
  where pt.commerce_order_id =
    v_order.id
    and pt.transaction_type =
      'deduct'
  limit 1;

  if found then

    return query
    select
      v_order.id,
      v_user_id,
      abs(
        v_existing.points
      )::integer,
      v_existing.balance_before::integer,
      v_existing.balance_after::integer,
      false;

    return;

  end if;


  /*
   * Payment identity links the durable order to its reservation.
   */
  if v_order.payment_transaction_id
    is not null
  then

    select p.*
    into v_payment
    from public.payment_transactions p
    where p.id =
      v_order.payment_transaction_id
    for update;

    if not found then
      raise exception
        'COMMERCE_POINT_DEDUCT_PAYMENT_NOT_FOUND'
        using errcode = 'P0002';
    end if;


    if
      v_payment.payment_status
        is distinct from 'paid'
      or v_payment.payment_purpose
        is distinct from 'order'
      or v_payment.order_created
        is distinct from true
      or v_payment.order_id
        is distinct from v_order.id
    then
      raise exception
        'COMMERCE_POINT_DEDUCT_PAYMENT_AUTHORITY_INVALID'
        using errcode = '55000';
    end if;


    select r.*
    into v_reservation
    from public.commerce_point_reservations r
    where r.payment_transaction_id =
      v_payment.id
    for update;

    v_has_reservation :=
      found;

  end if;


  /*
   * NEW RESERVATION PATH
   *
   * Explicit boolean is mandatory here. Do not depend on
   * ambient FOUND state from any earlier SELECT.
   */
  if v_has_reservation then

    if
      v_reservation.user_id <>
        v_user_id
      or v_reservation.points <>
        v_points
    then
      raise exception
        'COMMERCE_POINT_DEDUCT_RESERVATION_CONFLICT'
        using errcode = '55000';
    end if;


    if v_reservation.status =
      'released'
    then
      raise exception
        'COMMERCE_POINT_DEDUCT_RESERVATION_RELEASED'
        using errcode = '55000';
    end if;


    /*
     * Consumed reservation must already have its permanent
     * ledger. Missing ledger means durable corruption.
     */
    if v_reservation.status =
      'consumed'
    then

      select pt.*
      into v_existing
      from public.point_transactions pt
      where pt.commerce_order_id =
        v_order.id
        and pt.transaction_type =
          'deduct'
      limit 1;

      if not found then
        raise exception
          'COMMERCE_POINT_DEDUCT_CONSUMED_LEDGER_MISSING'
          using errcode = '55000';
      end if;


      return query
      select
        v_order.id,
        v_user_id,
        abs(
          v_existing.points
        )::integer,
        v_existing.balance_before::integer,
        v_existing.balance_after::integer,
        false;

      return;

    end if;


    if v_reservation.status
      is distinct from 'reserved'
    then
      raise exception
        'COMMERCE_POINT_DEDUCT_RESERVATION_STATE_INVALID'
        using errcode = '55000';
    end if;


    /*
     * Reservation snapshots describe the actual point balance
     * mutation that happened before payment.
     *
     * Do NOT mutate players.total_points here.
     */
    v_before :=
      v_reservation.balance_before;

    v_after :=
      v_reservation.balance_after;


    insert into public.point_transactions (

      user_id,

      commerce_order_id,

      transaction_type,

      points,

      balance_before,

      balance_after,

      reason,

      metadata

    )
    values (

      v_user_id,

      v_order.id,

      'deduct',

      -v_points,

      v_before,

      v_after,

      'Thanh toán đơn hàng '
        || v_order.order_code,

      jsonb_build_object(

        'source',
          'commerce_order',

        'effect_key',
          'points_deduct',

        'funding_source',
          'reserved_points',

        'payment_transaction_id',
          v_payment.id,

        'reserved_at',
          v_reservation.reserved_at,

        'order_code',
          v_order.order_code

      )

    )
    returning *
    into v_existing;


    update public.commerce_point_reservations r
    set
      status =
        'consumed',

      consumed_at =
        v_now,

      commerce_order_id =
        v_order.id,

      metadata =
        coalesce(
          r.metadata,
          '{}'::jsonb
        )
        ||
        jsonb_build_object(
          'consumed_at',
            v_now,
          'commerce_order_id',
            v_order.id
        )

    where r.payment_transaction_id =
      v_payment.id
      and r.status =
        'reserved';

    if not found then
      raise exception
        'COMMERCE_POINT_DEDUCT_RESERVATION_CONCURRENT_STATE_CHANGED'
        using errcode = '40001';
    end if;


    return query
    select
      v_order.id,
      v_user_id,
      v_points,
      v_before,
      v_after,
      true;

    return;

  end if;


  /*
   * ========================================================
   * LEGACY NON-RESERVATION PATH
   * ========================================================
   *
   * Preserve the existing V1 balance mutation behavior for
   * historical / pre-cutover orders.
   */

  select p.*
  into v_player
  from public.players p
  where p.user_id =
    v_user_id
  for update;

  if not found then
    raise exception
      'COMMERCE_POINT_DEDUCT_PLAYER_NOT_FOUND'
      using errcode = 'P0002';
  end if;


  /*
   * Recheck idempotency after player serialization.
   */
  select pt.*
  into v_existing
  from public.point_transactions pt
  where pt.commerce_order_id =
    v_order.id
    and pt.transaction_type =
      'deduct'
  limit 1;

  if found then

    return query
    select
      v_order.id,
      v_user_id,
      abs(
        v_existing.points
      )::integer,
      v_existing.balance_before::integer,
      v_existing.balance_after::integer,
      false;

    return;

  end if;


  v_balance_numeric :=
    coalesce(
      v_player.total_points,
      0
    );


  if
    v_balance_numeric <>
      trunc(v_balance_numeric)
    or v_balance_numeric < 0
    or v_balance_numeric >
      2147483647
  then
    raise exception
      'COMMERCE_POINT_BALANCE_DOMAIN_INVALID'
      using errcode = '55000';
  end if;


  v_before :=
    v_balance_numeric::integer;


  if v_before < v_points then
    raise exception
      'COMMERCE_POINT_DEDUCT_INSUFFICIENT_POINTS'
      using errcode = 'P0001';
  end if;


  v_after :=
    v_before -
    v_points;


  update public.players p
  set total_points =
    v_after
  where p.user_id =
    v_user_id;


  insert into public.point_transactions (

    user_id,

    commerce_order_id,

    transaction_type,

    points,

    balance_before,

    balance_after,

    reason,

    metadata

  )
  values (

    v_user_id,

    v_order.id,

    'deduct',

    -v_points,

    v_before,

    v_after,

    'Thanh toán đơn hàng '
      || v_order.order_code,

    jsonb_build_object(

      'source',
        'commerce_order',

      'effect_key',
        'points_deduct',

      'funding_source',
        'legacy_post_payment',

      'order_code',
        v_order.order_code

    )

  );


  return query
  select
    v_order.id,
    v_user_id,
    v_points,
    v_before,
    v_after,
    true;

end;
$$;


/* ----------------------------------------------------------
 * PRIVILEGES
 * ---------------------------------------------------------- */

revoke all
on function
  public.cing_commerce_release_payment_points_v1(
    bigint,
    text
  )
from
  public,
  anon,
  authenticated;


grant execute
on function
  public.cing_commerce_release_payment_points_v1(
    bigint,
    text
  )
to service_role;


/*
 * Reassert the existing backend-only boundary after replacing
 * the deduct function.
 */
revoke all
on function
  public.cing_commerce_apply_order_points_deduct_v1(bigint)
from
  public,
  anon,
  authenticated;


grant execute
on function
  public.cing_commerce_apply_order_points_deduct_v1(bigint)
to service_role;


commit;
