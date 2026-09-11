/*
 * Cing Commerce Point Redemption
 * Durable iPOS MINUS Delivery V1
 *
 * Financial contract:
 *
 * 1. Commerce reservation already debits players.total_points.
 * 2. Consuming reservation MUST NOT debit local points again.
 * 3. A consumed reservation creates a durable iPOS MINUS obligation.
 * 4. External CRM/iPOS point snapshots are blocked while that
 *    obligation is pending / processing / failed.
 * 5. Existing historical reservations are NEVER replayed blindly.
 * 6. iPOS delivery is verified using immutable membership_log note.
 */


/* ============================================================
 * 1. DURABLE DELIVERY STATE
 * ============================================================ */

alter table
  public.commerce_point_reservations
add column if not exists
  ipos_sync_status text;

alter table
  public.commerce_point_reservations
add column if not exists
  ipos_retry_count integer
  not null
  default 0;

alter table
  public.commerce_point_reservations
add column if not exists
  ipos_next_retry_at timestamptz;

alter table
  public.commerce_point_reservations
add column if not exists
  ipos_locked_until timestamptz;

alter table
  public.commerce_point_reservations
add column if not exists
  ipos_synced_at timestamptz;

alter table
  public.commerce_point_reservations
add column if not exists
  ipos_first_attempt_at timestamptz;

alter table
  public.commerce_point_reservations
add column if not exists
  ipos_last_error text;

alter table
  public.commerce_point_reservations
add column if not exists
  ipos_updated_at timestamptz
  not null
  default now();


/*
 * Cutover classification.
 *
 * Historical consumed / released / already-expired reserved rows
 * are NEVER replayed automatically.
 *
 * One exception is required for financial correctness:
 *
 * a reservation which is genuinely still in-flight at the exact
 * migration boundary has already removed points locally, but may
 * legitimately complete after cutover.
 *
 * Such a row becomes not_ready so:
 *
 * - stale CRM snapshots are blocked immediately;
 * - successful consume creates durable iPOS MINUS;
 * - later expiry recovery can safely restore the hold.
 *
 * Expired historical rows remain legacy_synced. They require
 * explicit forensic remediation and can never be auto-released
 * by the new runtime.
 */
update
  public.commerce_point_reservations r
set
  ipos_sync_status =
    case
      when
        r.status = 'reserved'
        and p.payment_purpose = 'order'
        and p.payment_status = 'pending'
        and p.order_created is not true
        and p.settlement_verified_at is null
        and p.settlement_consumed_at is null
        and p.expired_at is not null
        and p.expired_at > clock_timestamp()
      then
        'not_ready'
      else
        'legacy_synced'
    end,

  ipos_synced_at =
    case
      when
        r.status = 'reserved'
        and p.payment_purpose = 'order'
        and p.payment_status = 'pending'
        and p.order_created is not true
        and p.settlement_verified_at is null
        and p.settlement_consumed_at is null
        and p.expired_at is not null
        and p.expired_at > clock_timestamp()
      then
        null
      else
        coalesce(
          r.ipos_synced_at,
          r.consumed_at,
          r.released_at,
          r.reserved_at
        )
    end,

  ipos_updated_at =
    now()

from public.payment_transactions p

where
  r.payment_transaction_id = p.id
  and r.ipos_sync_status is null;


/*
 * New reservations begin with no external mutation obligation.
 * Only successful consumed redemption transitions to pending.
 */
alter table
  public.commerce_point_reservations
alter column
  ipos_sync_status
set default 'not_ready';

alter table
  public.commerce_point_reservations
alter column
  ipos_sync_status
set not null;


alter table
  public.commerce_point_reservations
drop constraint if exists
  commerce_point_reservations_ipos_status_ck;

alter table
  public.commerce_point_reservations
add constraint
  commerce_point_reservations_ipos_status_ck
check (
  ipos_sync_status in (
    'not_ready',
    'not_required',
    'legacy_synced',
    'pending',
    'processing',
    'synced',
    'failed'
  )
);


alter table
  public.commerce_point_reservations
drop constraint if exists
  commerce_point_reservations_ipos_retry_ck;

alter table
  public.commerce_point_reservations
add constraint
  commerce_point_reservations_ipos_retry_ck
check (
  ipos_retry_count >= 0
);


create index if not exists
commerce_point_reservations_ipos_pending_idx
on public.commerce_point_reservations (
  ipos_next_retry_at,
  consumed_at,
  payment_transaction_id
)
where
  status = 'consumed'
  and ipos_sync_status = 'pending';


create index if not exists
commerce_point_reservations_ipos_protection_idx
on public.commerce_point_reservations (
  user_id,
  status,
  ipos_sync_status
)
where
  (
    status = 'reserved'
    and ipos_sync_status = 'not_ready'
  )
  or
  (
    status = 'consumed'
    and ipos_sync_status in (
      'pending',
      'processing',
      'failed'
    )
  );


/* ============================================================
 * 2. STATUS TRANSITION AUTHORITY
 *
 * Reservation creation itself MUST NOT produce an iPOS MINUS.
 *
 * reserved -> consumed:
 *   durable MINUS becomes pending.
 *
 * reserved -> released:
 *   no iPOS mutation is required.
 * ============================================================ */

create or replace function
public.cing_commerce_point_redemption_ipos_state_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_op = 'INSERT' then

    if new.status = 'consumed' then
      new.ipos_sync_status :=
        'pending';

      new.ipos_next_retry_at :=
        coalesce(
          new.ipos_next_retry_at,
          clock_timestamp()
        );
    elsif new.status = 'released' then
      new.ipos_sync_status :=
        'not_required';

      new.ipos_next_retry_at :=
        null;
    else
      new.ipos_sync_status :=
        coalesce(
          new.ipos_sync_status,
          'not_ready'
        );
    end if;

    new.ipos_updated_at :=
      clock_timestamp();

    return new;
  end if;


  if
    old.status is distinct from new.status
  then

    if
      old.status = 'reserved'
      and new.status = 'consumed'
    then

      /*
       * Only post-cutover reservations with not_ready state
       * become deliverable.
       *
       * legacy_synced rows are never silently reopened.
       */
      if new.ipos_sync_status = 'not_ready' then
        new.ipos_sync_status :=
          'pending';

        new.ipos_next_retry_at :=
          clock_timestamp();

        new.ipos_locked_until :=
          null;

        new.ipos_last_error :=
          null;
      end if;

    elsif
      old.status = 'reserved'
      and new.status = 'released'
    then

      if new.ipos_sync_status = 'not_ready' then
        new.ipos_sync_status :=
          'not_required';

        new.ipos_next_retry_at :=
          null;

        new.ipos_locked_until :=
          null;

        new.ipos_last_error :=
          null;
      end if;

    end if;

  end if;


  new.ipos_updated_at :=
    clock_timestamp();

  return new;
end;
$function$;


drop trigger if exists
commerce_point_redemption_ipos_state_v1
on public.commerce_point_reservations;

create trigger
commerce_point_redemption_ipos_state_v1
before insert or update of status
on public.commerce_point_reservations
for each row
execute function
public.cing_commerce_point_redemption_ipos_state_v1();


/* ============================================================
 * 3. EXTEND EXTERNAL POINT SNAPSHOT GUARD
 *
 * Existing Block Puzzle protection remains intact.
 *
 * New protection:
 * while a consumed Commerce redemption has not been durably
 * mirrored to iPOS, stale CRM balance may not overwrite local.
 * ============================================================ */

create or replace function
public.cing_loyalty_apply_external_point_snapshot_guarded(
  p_user_id text,
  p_external_points integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_player public.players%rowtype;
  v_protected boolean := false;
  v_balance_before integer;
begin
  if
    p_user_id is null
    or btrim(p_user_id) = ''
  then
    raise exception
      'LOYALTY_EXTERNAL_SNAPSHOT_USER_REQUIRED'
      using errcode = '22023';
  end if;

  if
    p_external_points is null
    or p_external_points < 0
  then
    raise exception
      'LOYALTY_EXTERNAL_SNAPSHOT_POINTS_INVALID'
      using errcode = '22023';
  end if;


  /*
   * Common serialization boundary for every local loyalty mutation
   * protected by this authority.
   */
  select *
  into v_player
  from public.players
  where user_id = p_user_id
  for update;


  if not found then
    insert into public.players (
      user_id,
      total_points
    )
    values (
      p_user_id,
      p_external_points
    )
    returning *
    into v_player;

    return jsonb_build_object(
      'applied', true,
      'protected', false,
      'balance_before', null,
      'total_points', p_external_points
    );
  end if;


  if
    coalesce(
      v_player.total_points,
      0
    ) <>
    trunc(
      coalesce(
        v_player.total_points,
        0
      )
    )
  then
    raise exception
      'LOYALTY_LOCAL_POINT_BALANCE_INVALID'
      using errcode = '55000';
  end if;


  v_balance_before :=
    coalesce(
      v_player.total_points,
      0
    )::integer;


  /*
   * Existing Continue durable MINUS fence.
   */
  select exists (
    select 1
    from
      public.cing_block_puzzle_continue_purchases p
    where
      p.user_id = p_user_id
      and p.ipos_sync_status in (
        'pending',
        'processing',
        'failed'
      )
  )
  into v_protected;


  /*
   * Commerce durable redemption fence.
   *
   * Point balance is mutated at RESERVE time, before payment
   * settlement and before reservation consumption.
   *
   * Therefore protection begins while the reservation is still
   * reserved/not_ready and continues after successful consume
   * until MINUS is proven in iPOS membership_log.
   *
   * Released reservations do not remain protected because release
   * restores the held points locally and requires no iPOS MINUS.
   */
  if not v_protected then

    select exists (
      select 1
      from
        public.commerce_point_reservations r
      where
        r.user_id = p_user_id
        and (
          (
            r.status = 'reserved'
            and r.ipos_sync_status = 'not_ready'
          )
          or
          (
            r.status = 'consumed'
            and r.ipos_sync_status in (
              'pending',
              'processing',
              'failed'
            )
          )
        )
    )
    into v_protected;

  end if;


  if v_protected then
    return jsonb_build_object(
      'applied', false,
      'protected', true,
      'balance_before', v_balance_before,
      'total_points', v_balance_before
    );
  end if;


  update public.players
  set total_points =
    p_external_points
  where user_id =
    p_user_id;


  return jsonb_build_object(
    'applied', true,
    'protected', false,
    'balance_before', v_balance_before,
    'total_points', p_external_points
  );
end;
$function$;



/* ============================================================
 * 4. LEGACY STATE-ONLY RECONCILIATION
 *
 * This authority exists only for forensic cutover cleanup.
 *
 * It NEVER changes players.total_points.
 *
 * Intended case:
 *
 * - historical reservation already had its effective balance
 *   restored by a legacy external snapshot;
 * - adding points again would double-credit the member;
 * - we only need to close the stale reservation lifecycle.
 *
 * Safety:
 *
 * - caller must provide expected user + expected points;
 * - reservation must already be legacy_synced;
 * - reservation must still be reserved;
 * - payment must be expired/failed and completely unsettled;
 * - payment + reservation are locked;
 * - no client role may execute this function.
 * ============================================================ */

create or replace function
public.cing_commerce_reconcile_legacy_reservation_without_balance_v1(
  p_payment_transaction_id bigint,
  p_expected_user_id text,
  p_expected_points integer,
  p_reason text default null
)
returns table (
  payment_transaction_id bigint,
  user_id text,
  points integer,
  previous_status text,
  reservation_status text,
  balance_mutated boolean,
  replayed boolean
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_payment
    public.payment_transactions%rowtype;

  v_reservation
    public.commerce_point_reservations%rowtype;

  v_now timestamptz :=
    clock_timestamp();

  v_reason text;
begin
  if
    p_payment_transaction_id is null
  then
    raise exception
      'COMMERCE_LEGACY_RECONCILE_PAYMENT_REQUIRED'
      using errcode = '22023';
  end if;


  if
    p_expected_user_id is null
    or btrim(
      p_expected_user_id
    ) = ''
  then
    raise exception
      'COMMERCE_LEGACY_RECONCILE_USER_REQUIRED'
      using errcode = '22023';
  end if;


  if
    p_expected_points is null
    or p_expected_points <= 0
  then
    raise exception
      'COMMERCE_LEGACY_RECONCILE_POINTS_INVALID'
      using errcode = '22023';
  end if;


  select p.*
  into v_payment
  from public.payment_transactions p
  where p.id =
    p_payment_transaction_id
  for update;


  if not found then
    raise exception
      'COMMERCE_LEGACY_RECONCILE_PAYMENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;


  select r.*
  into v_reservation
  from public.commerce_point_reservations r
  where r.payment_transaction_id =
    v_payment.id
  for update;


  if not found then
    raise exception
      'COMMERCE_LEGACY_RECONCILE_RESERVATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;


  /*
   * Durable replay.
   */
  if
    v_reservation.status =
      'released'
    and v_reservation.release_reason =
      'legacy_external_snapshot_already_restored'
  then
    return query
    select
      v_reservation.payment_transaction_id,
      v_reservation.user_id,
      v_reservation.points,
      'released'::text,
      'released'::text,
      false,
      true;

    return;
  end if;


  if
    v_reservation.user_id
      is distinct from
      p_expected_user_id
    or v_payment.user_id
      is distinct from
      p_expected_user_id
  then
    raise exception
      'COMMERCE_LEGACY_RECONCILE_USER_MISMATCH'
      using errcode = '55000';
  end if;


  if
    v_reservation.points
      is distinct from
      p_expected_points
  then
    raise exception
      'COMMERCE_LEGACY_RECONCILE_POINTS_MISMATCH'
      using errcode = '55000';
  end if;


  if
    v_reservation.status
      is distinct from
      'reserved'
  then
    raise exception
      'COMMERCE_LEGACY_RECONCILE_STATE_INVALID'
      using errcode = '55000';
  end if;


  if
    v_reservation.ipos_sync_status
      is distinct from
      'legacy_synced'
  then
    raise exception
      'COMMERCE_LEGACY_RECONCILE_CUTOVER_STATE_INVALID'
      using errcode = '55000';
  end if;


  if
    v_payment.payment_purpose
      is distinct from
      'order'
  then
    raise exception
      'COMMERCE_LEGACY_RECONCILE_PURPOSE_INVALID'
      using errcode = '55000';
  end if;


  if
    v_payment.payment_status = 'paid'
    or v_payment.order_created is true
    or v_payment.paid_at is not null
    or v_payment.settlement_verified_at
      is not null
    or v_payment.settlement_consumed_at
      is not null
  then
    raise exception
      'COMMERCE_LEGACY_RECONCILE_ALREADY_SETTLED'
      using errcode = '55000';
  end if;


  if not (
    v_payment.payment_status = 'failed'
    or (
      v_payment.payment_status = 'pending'
      and v_payment.expired_at is not null
      and v_payment.expired_at <=
        v_now
    )
  ) then
    raise exception
      'COMMERCE_LEGACY_RECONCILE_PAYMENT_NOT_TERMINAL'
      using errcode = '55000';
  end if;


  v_reason :=
    nullif(
      btrim(
        coalesce(
          p_reason,
          ''
        )
      ),
      ''
    );


  /*
   * Critical invariant:
   *
   * NO players update exists in this function.
   *
   * The current local point balance is intentionally preserved.
   */
  update
    public.commerce_point_reservations r
  set
    status =
      'released',

    released_at =
      v_now,

    release_reason =
      coalesce(
        v_reason,
        'legacy_external_snapshot_already_restored'
      ),

    ipos_sync_status =
      'not_required',

    ipos_next_retry_at =
      null,

    ipos_locked_until =
      null,

    ipos_last_error =
      null,

    ipos_updated_at =
      v_now,

    metadata =
      coalesce(
        r.metadata,
        '{}'::jsonb
      )
      ||
      jsonb_build_object(
        'legacy_reconciliation',
        jsonb_build_object(
          'version',
            'commerce_point_stale_hold_v1',
          'reconciled_at',
            v_now,
          'method',
            'external_snapshot_already_restored_balance',
          'points_not_readded',
            v_reservation.points,
          'balance_mutated',
            false
        )
      )

  where
    r.payment_transaction_id =
      v_payment.id
    and r.status =
      'reserved'
    and r.ipos_sync_status =
      'legacy_synced';


  if not found then
    raise exception
      'COMMERCE_LEGACY_RECONCILE_CONCURRENT_STATE_CHANGED'
      using errcode = '40001';
  end if;


  return query
  select
    v_reservation.payment_transaction_id,
    v_reservation.user_id,
    v_reservation.points,
    v_reservation.status,
    'released'::text,
    false,
    false;
end;
$function$;


/* ============================================================
 * 5. BACKEND-ONLY ACL
 * ============================================================ */

revoke all
on function
public.cing_commerce_reconcile_legacy_reservation_without_balance_v1(
  bigint,
  text,
  integer,
  text
)
from public;

revoke all
on function
public.cing_commerce_reconcile_legacy_reservation_without_balance_v1(
  bigint,
  text,
  integer,
  text
)
from anon;

revoke all
on function
public.cing_commerce_reconcile_legacy_reservation_without_balance_v1(
  bigint,
  text,
  integer,
  text
)
from authenticated;

grant execute
on function
public.cing_commerce_reconcile_legacy_reservation_without_balance_v1(
  bigint,
  text,
  integer,
  text
)
to service_role;


revoke all
on function
public.cing_commerce_point_redemption_ipos_state_v1()
from public;

revoke all
on function
public.cing_commerce_point_redemption_ipos_state_v1()
from anon;

revoke all
on function
public.cing_commerce_point_redemption_ipos_state_v1()
from authenticated;


revoke all
on function
public.cing_loyalty_apply_external_point_snapshot_guarded(
  text,
  integer
)
from public;

revoke all
on function
public.cing_loyalty_apply_external_point_snapshot_guarded(
  text,
  integer
)
from anon;

revoke all
on function
public.cing_loyalty_apply_external_point_snapshot_guarded(
  text,
  integer
)
from authenticated;

grant execute
on function
public.cing_loyalty_apply_external_point_snapshot_guarded(
  text,
  integer
)
to service_role;


grant select
on table
  public.commerce_point_reservations
to service_role;

grant update (
  ipos_sync_status,
  ipos_retry_count,
  ipos_next_retry_at,
  ipos_locked_until,
  ipos_synced_at,
  ipos_first_attempt_at,
  ipos_last_error,
  ipos_updated_at
)
on table
  public.commerce_point_reservations
to service_role;
