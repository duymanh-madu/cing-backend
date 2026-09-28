begin;

/*
 * ==========================================================
 * CING GAME CENTER V2
 * POINTS -> REVIVE CREDIT PURCHASE AUTHORITY V1
 * ==========================================================
 *
 * DORMANT FOUNDATION.
 *
 * Price:
 *   one Revive Credit =
 *   app_configs.wallet_revive_credit_price / 1000 points.
 *
 * The configured VND price MUST be divisible by 1000.
 *
 * This migration does not:
 * - set a price;
 * - activate a route;
 * - grant EXECUTE to service_role;
 * - perform a purchase;
 * - call iPOS;
 * - change a player's existing balance;
 * - change the existing Wallet purchase function.
 *
 * Before activation, durable iPOS delivery and the external
 * point snapshot fence must include this new purchase source.
 */

create table public.cing_points_revive_credit_purchases (

  id uuid primary key,

  user_id text not null,

  quantity integer not null
    check (
      quantity > 0
    ),

  unit_price_vnd bigint not null
    check (
      unit_price_vnd > 0
      and mod(unit_price_vnd, 1000) = 0
    ),

  unit_price_points integer not null
    check (
      unit_price_points > 0
    ),

  total_points integer not null
    check (
      total_points > 0
    ),

  balance_before integer not null
    check (
      balance_before >= 0
    ),

  balance_after integer not null
    check (
      balance_after >= 0
    ),

  credit_transaction_id bigint not null
    references public.cing_revive_credit_transactions(id)
    on update restrict
    on delete restrict,

  credit_balance_after integer not null
    check (
      credit_balance_after >= 0
    ),

  ipos_sync_status text not null
    default 'pending'
    check (
      ipos_sync_status in (
        'pending',
        'processing',
        'synced',
        'failed'
      )
    ),

  ipos_retry_count integer not null
    default 0
    check (
      ipos_retry_count >= 0
    ),

  ipos_next_retry_at timestamptz
    default clock_timestamp(),

  ipos_locked_until timestamptz,

  ipos_first_attempt_at timestamptz,

  ipos_synced_at timestamptz,

  ipos_last_error text,

  created_at timestamptz not null
    default clock_timestamp(),

  updated_at timestamptz not null
    default clock_timestamp(),

  constraint
    cing_points_revive_purchase_user_ck
    check (
      btrim(user_id) <> ''
    ),

  constraint
    cing_points_revive_purchase_price_ck
    check (
      unit_price_vnd =
        unit_price_points::bigint * 1000
      and total_points::bigint =
        unit_price_points::bigint * quantity::bigint
    ),

  constraint
    cing_points_revive_purchase_balance_ck
    check (
      balance_after =
        balance_before - total_points
    )
);

create index
  cing_points_revive_purchase_pending_idx
on public.cing_points_revive_credit_purchases (
  ipos_next_retry_at,
  created_at
)
where ipos_sync_status = 'pending';

create index
  cing_points_revive_purchase_user_idx
on public.cing_points_revive_credit_purchases (
  user_id,
  created_at
);

/*
 * Permanent point ledger must also be exactly-once.
 *
 * This index is specific to the new purchase source.
 * Existing Commerce/V4 point ledger authorities are untouched.
 */

create unique index
  cing_point_tx_revive_purchase_v1_uq
on public.point_transactions (
  (
    metadata ->> 'purchase_id'
  )
)
where
  transaction_type = 'deduct'
  and metadata ->> 'source' =
    'points_revive_credit_purchase_v1';

/*
 * Purchase records are not client-writable.
 *
 * service_role may read receipts later, but cannot invoke
 * the purchase RPC until the complete iPOS cutover is ready.
 */

revoke all
on table public.cing_points_revive_credit_purchases
from public, anon, authenticated, service_role;

grant select
on table public.cing_points_revive_credit_purchases
to service_role;

/*
 * One PostgreSQL transaction:
 *
 * lock player
 * -> historical request replay check
 * -> server price
 * -> point debit
 * -> permanent point ledger
 * -> private Revive Credit grant
 * -> immutable purchase receipt
 *
 * Any exception rolls back all five financial changes.
 */

create function
public.cing_points_purchase_revive_credits_v1(
  p_user_id text,
  p_quantity integer,
  p_request_id uuid
)

returns table (

  applied boolean,

  request_id uuid,

  quantity integer,

  unit_price_vnd bigint,

  unit_price_points integer,

  total_points integer,

  points_balance_after integer,

  credit_transaction_id bigint,

  credit_balance_after integer,

  ipos_sync_status text

)

language plpgsql

security definer

set search_path = public

as $function$

declare

  v_user_id text;

  v_player public.players%rowtype;

  v_existing
    public.cing_points_revive_credit_purchases%rowtype;

  v_credit
    public.cing_revive_credit_transactions%rowtype;

  v_point_ledger
    public.point_transactions%rowtype;

  v_credit_result record;

  v_price bigint;

  v_unit_points integer;

  v_total_numeric numeric;

  v_total_points integer;

  v_balance_numeric numeric;

  v_balance_before integer;

  v_balance_after integer;

begin

  v_user_id :=
    nullif(
      btrim(
        coalesce(
          p_user_id,
          ''
        )
      ),
      ''
    );

  if v_user_id is null then

    raise exception
      'POINTS_REVIVE_USER_REQUIRED'
      using errcode = '22023';

  end if;

  if p_quantity is null
    or p_quantity <= 0
  then

    raise exception
      'POINTS_REVIVE_QUANTITY_INVALID'
      using errcode = '22023';

  end if;

  if p_request_id is null then

    raise exception
      'POINTS_REVIVE_REQUEST_ID_REQUIRED'
      using errcode = '22023';

  end if;

  /*
   * Same serialization boundary as the established
   * loyalty point purchase authority.
   */

  select p.*
  into v_player
  from public.players p
  where p.user_id = v_user_id
  for update;

  if not found then

    raise exception
      'POINTS_REVIVE_PLAYER_NOT_FOUND'
      using errcode = 'P0002';

  end if;

  /*
   * Historical replay BEFORE the current price.
   *
   * A price change cannot cause a second debit.
   */

  select r.*
  into v_existing
  from public.cing_points_revive_credit_purchases r
  where r.id = p_request_id;

  if found then

    if v_existing.user_id <> v_user_id
      or v_existing.quantity <> p_quantity
    then

      raise exception
        'POINTS_REVIVE_REQUEST_CONFLICT'
        using errcode = '23505';

    end if;

    select pt.*
    into v_point_ledger
    from public.point_transactions pt
    where pt.transaction_type = 'deduct'
      and pt.metadata ->> 'source' =
        'points_revive_credit_purchase_v1'
      and pt.metadata ->> 'purchase_id' =
        p_request_id::text;

    if not found then

      raise exception
        'POINTS_REVIVE_POINT_LEDGER_MISSING'
        using errcode = '55000';

    end if;

    if v_point_ledger.user_id <> v_user_id
      or v_point_ledger.points <>
        -v_existing.total_points
      or v_point_ledger.balance_before <>
        v_existing.balance_before
      or v_point_ledger.balance_after <>
        v_existing.balance_after
    then

      raise exception
        'POINTS_REVIVE_POINT_LEDGER_CONFLICT'
        using errcode = '55000';

    end if;

    select t.*
    into v_credit
    from public.cing_revive_credit_transactions t
    where t.id =
      v_existing.credit_transaction_id
      and t.user_id = v_user_id
      and t.reference_type =
        'points_revive_credit_purchase_v1'
      and t.reference_id =
        p_request_id::text;

    if not found then

      raise exception
        'POINTS_REVIVE_CREDIT_LEDGER_MISSING'
        using errcode = '55000';

    end if;

    if v_credit.transaction_type <> 'add'
      or v_credit.amount <> p_quantity
      or v_credit.balance_after <>
        v_existing.credit_balance_after
    then

      raise exception
        'POINTS_REVIVE_CREDIT_LEDGER_CONFLICT'
        using errcode = '55000';

    end if;

    return query select

      false,

      v_existing.id,

      v_existing.quantity,

      v_existing.unit_price_vnd,

      v_existing.unit_price_points,

      v_existing.total_points,

      v_existing.balance_after,

      v_existing.credit_transaction_id,

      v_existing.credit_balance_after,

      v_existing.ipos_sync_status;

    return;

  end if;

  /*
   * Single Admin-controlled VND price.
   *
   * No separate point price and no rounding.
   */

  select ac.wallet_revive_credit_price
  into v_price
  from public.app_configs ac
  where ac.id = 1;

  if v_price is null
    or v_price < 1000
    or mod(v_price, 1000) <> 0
  then

    raise exception
      'POINTS_REVIVE_PRICE_NOT_CONFIGURED'
      using errcode = '55000';

  end if;

  if v_price / 1000 > 2147483647 then

    raise exception
      'POINTS_REVIVE_UNIT_PRICE_OVERFLOW'
      using errcode = '22003';

  end if;

  v_unit_points :=
    (v_price / 1000)::integer;

  v_total_numeric :=
    v_unit_points::numeric
    * p_quantity::numeric;

  if v_total_numeric <= 0
    or v_total_numeric > 2147483647
  then

    raise exception
      'POINTS_REVIVE_TOTAL_OVERFLOW'
      using errcode = '22003';

  end if;

  v_total_points :=
    v_total_numeric::integer;

  v_balance_numeric :=
    coalesce(
      v_player.total_points,
      0
    );

  if v_balance_numeric <> trunc(v_balance_numeric)
    or v_balance_numeric < 0
    or v_balance_numeric > 2147483647
  then

    raise exception
      'POINTS_REVIVE_BALANCE_INVALID'
      using errcode = '55000';

  end if;

  v_balance_before :=
    v_balance_numeric::integer;

  if v_balance_before < v_total_points then

    raise exception
      'POINTS_REVIVE_INSUFFICIENT_POINTS'
      using
        errcode = 'P0001',
        detail =
          jsonb_build_object(
            'required_points',
            v_total_points,
            'current_points',
            v_balance_before
          )::text;

  end if;

  v_balance_after :=
    v_balance_before
    - v_total_points;

  /*
   * Point debit and permanent point ledger.
   */

  update public.players
  set total_points =
    v_balance_after
  where user_id =
    v_user_id;

  insert into public.point_transactions (

    user_id,

    order_id,

    transaction_type,

    points,

    balance_before,

    balance_after,

    reason,

    metadata

  )

  values (

    v_user_id,

    null,

    'deduct',

    -v_total_points,

    v_balance_before,

    v_balance_after,

    'Mua Revive Credit bằng điểm tích lũy',

    jsonb_build_object(

      'source',
      'points_revive_credit_purchase_v1',

      'purchase_id',
      p_request_id,

      'request_id',
      p_request_id,

      'quantity',
      p_quantity,

      'unit_price_vnd',
      v_price,

      'unit_price_points',
      v_unit_points,

      'total_points',
      v_total_points

    )

  );

  /*
   * Existing private Revive Credit authority.
   *
   * Same transaction as the point deduction.
   */

  select *
  into v_credit_result

  from public.cing_revive_credit_apply_private_v1(

    v_user_id,

    p_quantity,

    'Mua Revive Credit bằng điểm tích lũy',

    'points_revive_credit_purchase_v1',

    p_request_id::text,

    null::text,

    null::uuid,

    jsonb_build_object(

      'source',
      'points_revive_credit_purchase_v1',

      'purchase_id',
      p_request_id,

      'quantity',
      p_quantity,

      'unit_price_vnd',
      v_price,

      'unit_price_points',
      v_unit_points,

      'total_points',
      v_total_points

    )

  );

  if v_credit_result.applied is distinct from true
    or v_credit_result.transaction_id is null
    or v_credit_result.balance_after is null
  then

    raise exception
      'POINTS_REVIVE_CREDIT_GRANT_INVALID'
      using errcode = '55000';

  end if;

  /*
   * The receipt is also the future durable iPOS
   * delivery obligation.
   *
   * No worker is activated by this migration.
   */

  insert into public.cing_points_revive_credit_purchases (

    id,

    user_id,

    quantity,

    unit_price_vnd,

    unit_price_points,

    total_points,

    balance_before,

    balance_after,

    credit_transaction_id,

    credit_balance_after,

    ipos_sync_status

  )

  values (

    p_request_id,

    v_user_id,

    p_quantity,

    v_price,

    v_unit_points,

    v_total_points,

    v_balance_before,

    v_balance_after,

    v_credit_result.transaction_id,

    v_credit_result.balance_after,

    'pending'

  );

  return query select

    true,

    p_request_id,

    p_quantity,

    v_price,

    v_unit_points,

    v_total_points,

    v_balance_after,

    v_credit_result.transaction_id,

    v_credit_result.balance_after,

    'pending'::text;

end;

$function$;

/*
 * Intentionally NO service_role EXECUTE.
 *
 * Activation requires:
 * - durable iPOS MINUS delivery;
 * - membership_log preflight/postflight;
 * - snapshot protection for this purchase source;
 * - recovery and concurrency tests;
 * - explicit production release authorization.
 */

revoke all
on function
public.cing_points_purchase_revive_credits_v1(
  text,
  integer,
  uuid
)
from public, anon, authenticated, service_role;

commit;
