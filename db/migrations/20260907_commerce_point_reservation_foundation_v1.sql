begin;


/*
 * ==========================================================
 * CING COMMERCE — POINT RESERVATION FOUNDATION V1
 * ==========================================================
 *
 * Problem:
 *
 * External payment and Cing Wallet settlement happen after
 * checkout pricing is frozen. Loyalty points used by the same
 * checkout must therefore be made unavailable before any
 * irreversible payment rail starts.
 *
 * Authority model:
 *
 *   payment_transactions
 *     -> canonical user + cart snapshot
 *
 *   players.total_points
 *     -> serialized spendable loyalty balance
 *
 *   commerce_point_reservations
 *     -> temporary financial hold lifecycle
 *
 * Reservation immediately decreases players.total_points.
 *
 * It intentionally does NOT create point_transactions yet.
 * point_transactions remains the permanent loyalty ledger and
 * will be written only when a paid commerce order consumes the
 * reservation.
 *
 * A failed/expired payment will later release the reservation
 * and restore the balance exactly once.
 */


/* ----------------------------------------------------------
 * TEMPORARY POINT HOLD LEDGER
 * ---------------------------------------------------------- */

create table if not exists
public.commerce_point_reservations (

  payment_transaction_id bigint
    primary key
    references public.payment_transactions(id)
    on delete restrict,

  user_id text
    not null,

  points integer
    not null,

  status text
    not null
    default 'reserved',

  balance_before integer
    not null,

  balance_after integer
    not null,

  reserved_at timestamptz
    not null
    default clock_timestamp(),

  consumed_at timestamptz,

  released_at timestamptz,

  commerce_order_id bigint
    references public.orders(id)
    on delete restrict,

  release_reason text,

  metadata jsonb
    not null
    default '{}'::jsonb,

  constraint
    commerce_point_reservations_points_ck
  check (
    points > 0
  ),

  constraint
    commerce_point_reservations_balance_ck
  check (
    balance_before >= 0
    and balance_after >= 0
    and balance_after =
      balance_before - points
  ),

  constraint
    commerce_point_reservations_status_ck
  check (
    status in (
      'reserved',
      'consumed',
      'released'
    )
  ),

  constraint
    commerce_point_reservations_lifecycle_ck
  check (
    (
      status = 'reserved'
      and consumed_at is null
      and released_at is null
      and commerce_order_id is null
    )
    or
    (
      status = 'consumed'
      and consumed_at is not null
      and released_at is null
      and commerce_order_id is not null
    )
    or
    (
      status = 'released'
      and consumed_at is null
      and released_at is not null
      and commerce_order_id is null
    )
  )
);


create index if not exists
commerce_point_reservations_user_status_idx
on public.commerce_point_reservations (
  user_id,
  status,
  reserved_at desc
);


create index if not exists
commerce_point_reservations_reserved_idx
on public.commerce_point_reservations (
  reserved_at,
  payment_transaction_id
)
where status = 'reserved';


/* ----------------------------------------------------------
 * RESERVE POINTS FOR CANONICAL PAYMENT
 *
 * Caller supplies payment identity only.
 *
 * PostgreSQL derives:
 *
 * - user
 * - requested points
 * - payment purpose/state
 * - current point balance
 *
 * No caller-controlled user or amount crosses this boundary.
 * ---------------------------------------------------------- */

create or replace function
public.cing_commerce_reserve_payment_points_v1(
  p_payment_transaction_id bigint
)
returns table (

  payment_transaction_id bigint,

  user_id text,

  points_reserved integer,

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

  v_player
    public.players%rowtype;

  v_existing
    public.commerce_point_reservations%rowtype;

  v_user_id text;

  v_points_text text;
  v_points_numeric numeric;
  v_points integer;

  v_balance_numeric numeric;
  v_before integer;
  v_after integer;

  v_now timestamptz :=
    clock_timestamp();

begin

  if p_payment_transaction_id is null then
    raise exception
      'COMMERCE_POINT_RESERVATION_PAYMENT_REQUIRED'
      using errcode = '22023';
  end if;


  /*
   * Payment row is the first serialization boundary.
   *
   * This also prevents two concurrent reserve attempts for the
   * same payment from reaching the player mutation together.
   */
  select p.*
  into v_payment
  from public.payment_transactions p
  where p.id =
    p_payment_transaction_id
  for update;

  if not found then
    raise exception
      'COMMERCE_POINT_RESERVATION_PAYMENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;


  if v_payment.payment_purpose
    is distinct from 'order'
  then
    raise exception
      'COMMERCE_POINT_RESERVATION_PURPOSE_INVALID'
      using errcode = '55000';
  end if;


  v_user_id :=
    nullif(
      btrim(
        coalesce(
          v_payment.user_id,
          ''
        )
      ),
      ''
    );

  if v_user_id is null then
    raise exception
      'COMMERCE_POINT_RESERVATION_USER_MISSING'
      using errcode = '55000';
  end if;


  /*
   * Points are derived exclusively from the frozen canonical
   * payment snapshot.
   */
  v_points_text :=
    nullif(
      btrim(
        coalesce(
          v_payment.cart_snapshot
            ->> 'points_used',
          ''
        )
      ),
      ''
    );


  if v_points_text is null then
    v_points := 0;

  else
    begin

      v_points_numeric :=
        v_points_text::numeric;

    exception
      when invalid_text_representation
        or numeric_value_out_of_range
      then
        raise exception
          'COMMERCE_POINT_RESERVATION_AMOUNT_INVALID'
          using errcode = '22023';
    end;


    if
      v_points_numeric <>
        trunc(v_points_numeric)
      or v_points_numeric < 0
      or v_points_numeric >
        2147483647
    then
      raise exception
        'COMMERCE_POINT_RESERVATION_AMOUNT_INVALID'
        using errcode = '22023';
    end if;


    v_points :=
      v_points_numeric::integer;

  end if;


  /*
   * Existing reservation is authoritative replay state.
   *
   * Check this before payment terminal-state validation because
   * the payment may legitimately become paid after the original
   * reservation was created.
   */
  select r.*
  into v_existing
  from public.commerce_point_reservations r
  where r.payment_transaction_id =
    v_payment.id;

  if found then

    if
      v_existing.user_id <>
        v_user_id
      or v_existing.points <>
        v_points
    then
      raise exception
        'COMMERCE_POINT_RESERVATION_REPLAY_CONFLICT'
        using errcode = '55000';
    end if;


    return query
    select
      v_existing.payment_transaction_id,
      v_existing.user_id,
      v_existing.points,
      v_existing.balance_before,
      v_existing.balance_after,
      v_existing.status,
      true;

    return;

  end if;


  /*
   * Zero-point checkout requires no hold.
   */
  if v_points = 0 then

    return query
    select
      v_payment.id,
      v_user_id,
      0,
      null::integer,
      null::integer,
      'not_required'::text,
      false;

    return;

  end if;


  /*
   * New reservations are allowed only before any successful or
   * consumed settlement exists.
   */
  if v_payment.payment_status
    is distinct from 'pending'
  then
    raise exception
      'COMMERCE_POINT_RESERVATION_PAYMENT_NOT_PENDING'
      using errcode = '55000';
  end if;


  if
    v_payment.settlement_verified_at
      is not null
    or
    v_payment.settlement_consumed_at
      is not null
  then
    raise exception
      'COMMERCE_POINT_RESERVATION_SETTLEMENT_ALREADY_STARTED'
      using errcode = '55000';
  end if;


  if
    v_payment.expired_at is not null
    and v_payment.expired_at <=
      v_now
  then
    raise exception
      'COMMERCE_POINT_RESERVATION_PAYMENT_EXPIRED'
      using errcode = '55000';
  end if;


  /*
   * players row is the loyalty serialization boundary.
   *
   * Immediate subtraction makes the held points unavailable to
   * every legacy writer that still reads players.total_points.
   */
  select p.*
  into v_player
  from public.players p
  where p.user_id =
    v_user_id
  for update;

  if not found then
    raise exception
      'COMMERCE_POINT_RESERVATION_PLAYER_NOT_FOUND'
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
      'COMMERCE_POINT_RESERVATION_BALANCE_INVALID'
      using errcode = '55000';
  end if;


  v_before :=
    v_balance_numeric::integer;


  if v_before < v_points then
    raise exception
      'COMMERCE_POINT_RESERVATION_INSUFFICIENT_POINTS'
      using errcode = 'P0001';
  end if;


  v_after :=
    v_before - v_points;


  update public.players p
  set total_points =
    v_after
  where p.user_id =
    v_user_id;


  insert into
  public.commerce_point_reservations (

    payment_transaction_id,

    user_id,

    points,

    status,

    balance_before,

    balance_after,

    reserved_at,

    metadata

  )
  values (

    v_payment.id,

    v_user_id,

    v_points,

    'reserved',

    v_before,

    v_after,

    v_now,

    jsonb_build_object(

      'source',
        'commerce_checkout',

      'effect_key',
        'points_reservation',

      'transaction_code',
        v_payment.transaction_code

    )

  )
  returning *
  into v_existing;


  if
    v_existing.balance_after <>
      v_existing.balance_before
        - v_existing.points
  then
    raise exception
      'COMMERCE_POINT_RESERVATION_BALANCE_INVARIANT'
      using errcode = '55000';
  end if;


  return query
  select

    v_existing.payment_transaction_id,

    v_existing.user_id,

    v_existing.points,

    v_existing.balance_before,

    v_existing.balance_after,

    v_existing.status,

    false;

end;
$$;


/* ----------------------------------------------------------
 * PRIVILEGE BOUNDARY
 * ---------------------------------------------------------- */

revoke all
on table
  public.commerce_point_reservations
from
  public,
  anon,
  authenticated,
  service_role;


grant select
on table
  public.commerce_point_reservations
to service_role;


revoke all
on function
  public.cing_commerce_reserve_payment_points_v1(bigint)
from
  public,
  anon,
  authenticated;


grant execute
on function
  public.cing_commerce_reserve_payment_points_v1(bigint)
to service_role;


commit;
