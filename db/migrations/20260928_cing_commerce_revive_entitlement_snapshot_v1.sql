begin;

/*
 * CING GAME CENTER V2
 * COMMERCE REVIVE ENTITLEMENT PRICE SNAPSHOT V1
 *
 * Installation creates snapshot capability for FUTURE Commerce
 * orders. Existing orders are not backfilled or repriced.
 *
 * No Revive Credit grant.
 * No legacy game_plays mutation.
 * No payment or loyalty mutation.
 * No Free Start / conversion / writer-gate closure.
 *
 * This is NOT an entitlement-time authority:
 * order insertion time and callback time alone cannot prove
 * a historical payment's original economic event time.
 */

do $pre$
begin
  if to_regclass('public.orders') is null
    or to_regclass('public.app_configs') is null
  then
    raise exception
      'CING_COMMERCE_REVIVE_SNAPSHOT_DEPENDENCY_MISSING';
  end if;
end;
$pre$;

create table public.cing_commerce_revive_price_snapshots_v1 (
  order_id bigint primary key
    references public.orders(id)
    on update restrict
    on delete restrict,

  spend_per_play bigint
    check (spend_per_play > 0),

  snapshot_status text not null
    check (
      snapshot_status in (
        'valid',
        'review_required'
      )
    ),

  constraint cing_commerce_revive_price_snapshot_status_ck
    check (
      (
        snapshot_status = 'valid'
        and spend_per_play is not null
      )
      or
      (
        snapshot_status = 'review_required'
        and spend_per_play is null
      )
    ),

  captured_at timestamptz not null
    default clock_timestamp(),

  snapshot_version integer not null
    default 1
    check (snapshot_version = 1)
);

revoke all
on table public.cing_commerce_revive_price_snapshots_v1
from public, anon, authenticated, service_role;

grant select
on table public.cing_commerce_revive_price_snapshots_v1
to service_role;

/*
 * Capture the configured reward threshold at canonical
 * Commerce order INSERT, under a shared config row lock.
 *
 * This never mutates an existing order or creates a reward.
 * A missing/invalid price makes the REWARD review-required,
 * without rejecting the Commerce order transaction.
 */

create function
public.cing_commerce_revive_price_snapshot_insert_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_price bigint;
begin
  /*
   * The optional Game Center snapshot must not abort Commerce
   * order creation if its own config read or snapshot insert
   * encounters an ordinary SQL error.
   *
   * The exception subtransaction rolls back only this reward
   * snapshot attempt. A missing snapshot is NOT permission to
   * use current Admin pricing: future reward delivery must
   * classify it as review_required.
   *
   * No payment, Wallet, loyalty or order fields are modified.
   */
  begin
    select c.spend_per_play::bigint
    into v_price
    from public.app_configs c
    where c.id = 1
    for share;

    insert into
      public.cing_commerce_revive_price_snapshots_v1 (
        order_id,
        spend_per_play,
        snapshot_status
      )
    values (
      new.id,
      case
        when v_price > 0 then v_price
        else null
      end,
      case
        when v_price > 0 then 'valid'
        else 'review_required'
      end
    );

  exception when others then
    /*
     * Do not log payment details or customer information.
     * Absence of the snapshot is durable review evidence,
     * never a silently successful reward delivery.
     */
    raise warning
      'CING_COMMERCE_REVIVE_SNAPSHOT_REVIEW_REQUIRED SQLSTATE=%',
      SQLSTATE;
  end;

  return new;
end;
$fn$;

revoke all
on function
public.cing_commerce_revive_price_snapshot_insert_v1()
from public, anon, authenticated, service_role;

create trigger
cing_commerce_revive_price_snapshot_insert_v1
after insert
on public.orders
for each row
execute function
public.cing_commerce_revive_price_snapshot_insert_v1();

/*
 * Preserve snapshot immutability at the database layer.
 * Privileged future migrations require an explicit,
 * separately reviewed schema change.
 */

create function
public.cing_commerce_revive_price_snapshot_immutable_v1()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  raise exception
    'CING_COMMERCE_REVIVE_PRICE_SNAPSHOT_IMMUTABLE'
    using errcode = '55000';
end;
$fn$;

revoke all
on function
public.cing_commerce_revive_price_snapshot_immutable_v1()
from public, anon, authenticated, service_role;

create trigger
cing_commerce_revive_price_snapshot_immutable_v1
before update or delete
on public.cing_commerce_revive_price_snapshots_v1
for each row
execute function
public.cing_commerce_revive_price_snapshot_immutable_v1();

commit;
