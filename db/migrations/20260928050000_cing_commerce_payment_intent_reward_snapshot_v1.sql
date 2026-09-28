begin;

/*
 * CING GAME CENTER V2 — BRIDGE B1
 * Commerce reward-price evidence at PAYMENT INTENT INSERT.
 *
 * Dormant capability only:
 * - no award / conversion / legacy mutation;
 * - no Wallet or loyalty debit;
 * - no iPOS call;
 * - no cutover flag or writer-fence change;
 * - no modification or backfill of historical payments.
 *
 * Intent creation time is NOT proof of payment time.
 * Future entitlement RPC must independently verify settlement,
 * economic time, canonical identity, payment/order ownership
 * and cross-source ledger exclusion.
 */

create table public.cing_commerce_payment_intent_reward_snapshots_v1 (
    payment_transaction_id text primary key,
    transaction_code text not null,
    intent_created_at timestamptz,
    spend_per_play bigint,
    snapshot_status text not null,
    review_reason text,
    captured_at timestamptz not null default clock_timestamp(),
    snapshot_version integer not null default 1,

    constraint cing_payment_intent_snapshot_id_ck
      check (btrim(payment_transaction_id) <> ''),

    constraint cing_payment_intent_snapshot_code_ck
      check (btrim(transaction_code) <> ''),

    constraint cing_payment_intent_snapshot_version_ck
      check (snapshot_version = 1),

    constraint cing_payment_intent_snapshot_status_ck
      check (
        (
          snapshot_status = 'valid'
          and spend_per_play is not null
          and spend_per_play > 0
          and intent_created_at is not null
          and review_reason is null
        )
        or
        (
          snapshot_status = 'review_required'
          and spend_per_play is null
          and review_reason is not null
          and btrim(review_reason) <> ''
        )
      )
);

create unique index
  cing_payment_intent_reward_snapshot_code_uq
on public.cing_commerce_payment_intent_reward_snapshots_v1 (
  transaction_code
);

revoke all
on public.cing_commerce_payment_intent_reward_snapshots_v1
from public, anon, authenticated, service_role;

grant select
on public.cing_commerce_payment_intent_reward_snapshots_v1
to service_role;

create function
public.cing_commerce_payment_intent_reward_snapshot_insert_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_price bigint;
  v_status text;
  v_reason text;
begin
  /*
   * Wallet top-ups and other non-order payment purposes
   * never create game reward-price snapshots.
   */
  if coalesce(new.payment_purpose, 'order') <> 'order' then
    return new;
  end if;

  /*
   * Lock Admin config in SHARE mode while capturing
   * the original payment-intent threshold.
   *
   * Do not use fallback 20000 or any later Admin price.
   */
  begin
    select c.spend_per_play::bigint
      into v_price
    from public.app_configs c
    where c.id = 1
    for share;

    if v_price is not null
       and v_price > 0
       and new.created_at is not null then
      v_status := 'valid';
      v_reason := null;
    else
      v_price := null;
      v_status := 'review_required';
      v_reason := case
        when new.created_at is null
          then 'payment_intent_created_at_missing'
        else 'payment_intent_reward_threshold_invalid'
      end;
    end if;

    insert into
      public.cing_commerce_payment_intent_reward_snapshots_v1 (
        payment_transaction_id,
        transaction_code,
        intent_created_at,
        spend_per_play,
        snapshot_status,
        review_reason
      )
    values (
      new.id::text,
      new.transaction_code,
      new.created_at,
      v_price,
      v_status,
      v_reason
    );

  exception when others then
    /*
     * Optional game reward evidence must not turn a
     * valid food/drink payment intent into a failed checkout.
     *
     * An absent snapshot is NEVER an award authorization.
     * Future reward authority must return review_required.
     */
    raise warning
      'CING_PAYMENT_INTENT_REWARD_SNAPSHOT_REVIEW SQLSTATE=%',
      SQLSTATE;
  end;

  return new;
end;
$fn$;

revoke all
on function
public.cing_commerce_payment_intent_reward_snapshot_insert_v1()
from public, anon, authenticated, service_role;

create trigger
  cing_commerce_payment_intent_reward_snapshot_insert_v1
after insert
on public.payment_transactions
for each row
execute function
  public.cing_commerce_payment_intent_reward_snapshot_insert_v1();

create function
public.cing_commerce_payment_intent_reward_snapshot_immutable_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $fn$
begin
  raise exception
    'CING_PAYMENT_INTENT_REWARD_SNAPSHOT_IMMUTABLE'
    using errcode = '55000';
end;
$fn$;

revoke all
on function
public.cing_commerce_payment_intent_reward_snapshot_immutable_v1()
from public, anon, authenticated, service_role;

create trigger
  cing_commerce_payment_intent_reward_snapshot_immutable_v1
before update or delete
on public.cing_commerce_payment_intent_reward_snapshots_v1
for each row
execute function
  public.cing_commerce_payment_intent_reward_snapshot_immutable_v1();

commit;
