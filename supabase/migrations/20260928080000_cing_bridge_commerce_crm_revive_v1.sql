begin;

/*
 * CING GAME CENTER V2
 * VERIFIED COMMERCE <-> CRM/IPOS BRIDGE + CRM REVIVE AUTHORITY
 *
 * DORMANT:
 * - no service_role EXECUTE for award/link RPCs;
 * - no cutover timestamp mutation;
 * - no writer-fence mutation;
 * - no historical backfill;
 * - no Wallet or loyalty-point mutation;
 * - no direct iPOS call.
 */

/*
 * One verified Commerce order can map to at most one CRM row,
 * and vice versa.
 */
create table
public.cing_bridge_commerce_crm_links_v1 (
  commerce_order_id bigint primary key
    references public.orders(id)
    on update restrict
    on delete restrict,

  crm_order_id bigint not null unique
    references public.crm_orders(id)
    on update restrict
    on delete restrict,

  foodbook_code text not null unique,

  verification_method text not null
    check (
      verification_method =
        'ipos_dispatch_webhook_roundtrip_v1'
    ),

  ipos_dispatch_log_reference text not null,

  webhook_log_reference text not null,

  verified_at timestamptz not null
    default clock_timestamp(),

  constraint cing_bridge_crm_foodbook_ck
    check (btrim(foodbook_code) <> ''),

  constraint cing_bridge_crm_dispatch_ref_ck
    check (btrim(ipos_dispatch_log_reference) <> ''),

  constraint cing_bridge_crm_webhook_ref_ck
    check (btrim(webhook_log_reference) <> '')
);

revoke all
on public.cing_bridge_commerce_crm_links_v1
from public, anon, authenticated, service_role;

grant select
on public.cing_bridge_commerce_crm_links_v1
to service_role;


/*
 * Establish exact cross-source equivalence.
 *
 * Required independent evidence:
 * 1. canonical paid Commerce order,
 * 2. verified outbound iPOS identity,
 * 3. successful outbound iPOS log,
 * 4. inbound iPOS webhook carrying same foodbook_code,
 * 5. exactly one CRM order for that external code,
 * 6. same canonical owner,
 * 7. same economic amount.
 *
 * No caller-supplied CRM id, owner, amount or code.
 */
create function
public.cing_bridge_verify_commerce_crm_link_v1(
  p_commerce_order_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_order public.orders%rowtype;
  v_payment public.payment_transactions%rowtype;
  v_identity
    public.cing_commerce_ipos_verified_identities_v1%rowtype;
  v_crm public.crm_orders%rowtype;
  v_existing
    public.cing_bridge_commerce_crm_links_v1%rowtype;

  v_crm_count bigint;
  v_webhook_count bigint;

  v_user text;
  v_crm_user text;

  v_webhook_ref text;
begin
  if p_commerce_order_id is null then
    raise exception 'BRIDGE_LINK_COMMERCE_ORDER_REQUIRED'
      using errcode = '22023';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_commerce_order_id
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'commerce_order_missing'
    );
  end if;

  select *
  into v_payment
  from public.payment_transactions
  where id = v_order.payment_transaction_id
    and order_id = v_order.id
    and order_created is true
    and payment_status = 'paid'
    and payment_purpose = 'order'
  for share;

  if not found
     or v_order.payment_status is distinct from 'paid'
  then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'commerce_payment_link_unverified'
    );
  end if;

  select *
  into v_identity
  from public.cing_commerce_ipos_verified_identities_v1
  where commerce_order_id = v_order.id;

  if not found then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'verified_ipos_dispatch_identity_missing'
    );
  end if;

  /*
   * Require exactly one CRM representation.
   */
  select count(*)
  into v_crm_count
  from public.crm_orders c
  where c.order_code =
    'ORD-' || v_identity.foodbook_code;

  if v_crm_count = 0 then
    return jsonb_build_object(
      'status', 'deferred',
      'reason', 'crm_order_not_observed_yet'
    );
  end if;

  if v_crm_count <> 1 then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'crm_order_identity_ambiguous'
    );
  end if;

  select *
  into v_crm
  from public.crm_orders c
  where c.order_code =
    'ORD-' || v_identity.foodbook_code
  for update;

  /*
   * The external code must have come back through an
   * actual iPOS webhook. crm_orders string equality alone
   * is not enough.
   */
  select count(*)
  into v_webhook_count
  from public.ipos_webhook_log w
  where w.foodbook_code =
    v_identity.foodbook_code;

  if v_webhook_count = 0 then
    return jsonb_build_object(
      'status', 'deferred',
      'reason', 'ipos_webhook_roundtrip_missing'
    );
  end if;

  /*
   * Multiple webhook deliveries are normal replay.
   * Persist one deterministic proof reference only.
   */
  select min(w.id::text)
  into v_webhook_ref
  from public.ipos_webhook_log w
  where w.foodbook_code =
    v_identity.foodbook_code;

  if v_webhook_ref is null then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'ipos_webhook_reference_missing'
    );
  end if;

  /*
   * Normalize only the known 84xxxxxxxxx representation.
   */
  v_user := btrim(coalesce(v_order.user_id, ''));
  v_crm_user := btrim(coalesce(v_crm.user_id, ''));

  if v_user ~ '^84[0-9]{9}$' then
    v_user := '0' || substr(v_user, 3);
  end if;

  if v_crm_user ~ '^84[0-9]{9}$' then
    v_crm_user := '0' || substr(v_crm_user, 3);
  end if;

  if v_user = ''
     or v_crm_user = ''
     or v_user <> v_crm_user
  then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'commerce_crm_owner_mismatch'
    );
  end if;

  if v_order.total_amount is null
     or v_crm.order_amount is null
     or v_order.total_amount <> v_crm.order_amount
  then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'commerce_crm_amount_mismatch'
    );
  end if;

  /*
   * Existing link replay is allowed only when every
   * canonical identity remains unchanged.
   */
  select *
  into v_existing
  from public.cing_bridge_commerce_crm_links_v1
  where commerce_order_id = v_order.id;

  if found then
    if v_existing.crm_order_id <> v_crm.id
       or v_existing.foodbook_code
            <> v_identity.foodbook_code
       or v_existing.ipos_dispatch_log_reference
            <> v_identity.ipos_log_reference
    then
      return jsonb_build_object(
        'status', 'review_required',
        'reason', 'commerce_crm_link_replay_conflict'
      );
    end if;

    return jsonb_build_object(
      'status', 'verified',
      'replayed', true,
      'commerce_order_id', v_order.id,
      'crm_order_id', v_crm.id,
      'foodbook_code', v_identity.foodbook_code
    );
  end if;

  insert into public.cing_bridge_commerce_crm_links_v1 (
    commerce_order_id,
    crm_order_id,
    foodbook_code,
    verification_method,
    ipos_dispatch_log_reference,
    webhook_log_reference
  )
  values (
    v_order.id,
    v_crm.id,
    v_identity.foodbook_code,
    'ipos_dispatch_webhook_roundtrip_v1',
    v_identity.ipos_log_reference,
    v_webhook_ref
  );

  return jsonb_build_object(
    'status', 'verified',
    'replayed', false,
    'commerce_order_id', v_order.id,
    'crm_order_id', v_crm.id,
    'foodbook_code', v_identity.foodbook_code
  );
end;
$fn$;

revoke all
on function
public.cing_bridge_verify_commerce_crm_link_v1(bigint)
from public, anon, authenticated, service_role;


/*
 * Immutable verified source identity.
 */
create function
public.cing_bridge_commerce_crm_link_immutable_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $fn$
begin
  raise exception 'CING_BRIDGE_COMMERCE_CRM_LINK_IMMUTABLE'
    using errcode = '55000';
end;
$fn$;

revoke all
on function
public.cing_bridge_commerce_crm_link_immutable_v1()
from public, anon, authenticated, service_role;

create trigger
  cing_bridge_commerce_crm_link_immutable_v1
before update or delete
on public.cing_bridge_commerce_crm_links_v1
for each row
execute function
  public.cing_bridge_commerce_crm_link_immutable_v1();


/*
 * CRM / POS -> Revive Credit V2.
 *
 * For a CRM row already linked to Commerce, Commerce owns
 * the one economic entitlement. CRM must never create a
 * second Revive Credit transaction.
 *
 * Independent in-store CRM orders use their immutable
 * reward snapshot captured at crm_orders INSERT.
 */
create function
public.cing_bridge_crm_award_revive_v1(
  p_crm_order_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_order public.crm_orders%rowtype;
  v_delivery
    public.cing_crm_order_reward_delivery_v1%rowtype;

  v_gate_closed boolean;
  v_cutover timestamptz;

  v_user text;
  v_amount bigint;
  v_price bigint;

  v_quantity_numeric numeric;
  v_quantity integer;

  v_legacy_count bigint;
  v_result record;
  v_metadata jsonb;
begin
  if p_crm_order_id is null then
    raise exception 'BRIDGE_CRM_ORDER_ID_REQUIRED'
      using errcode = '22023';
  end if;

  select g.is_closed
  into v_gate_closed
  from public.cing_legacy_game_plays_writer_gate g
  where g.gate_id = 1
  for share;

  if not found or v_gate_closed is distinct from true then
    return jsonb_build_object(
      'status', 'deferred',
      'reason', 'legacy_writer_gate_open'
    );
  end if;

  select c.cutover_at
  into v_cutover
  from public.cing_bridge_v2_reward_cutover c
  where c.singleton is true
  for share;

  if not found or v_cutover is null then
    return jsonb_build_object(
      'status', 'deferred',
      'reason', 'bridge_cutover_not_authorized'
    );
  end if;

  select *
  into v_order
  from public.crm_orders
  where id = p_crm_order_id
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'crm_order_missing'
    );
  end if;

  if v_order.processed is distinct from true then
    return jsonb_build_object(
      'status', 'deferred',
      'reason', 'crm_order_not_processed'
    );
  end if;

  /*
   * If this CRM row has been proven equivalent to a
   * Commerce order, Commerce authority owns the grant.
   */
  if exists (
    select 1
    from public.cing_bridge_commerce_crm_links_v1 l
    where l.crm_order_id = v_order.id
  ) then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'commerce_link_owns_entitlement'
    );
  end if;

  /*
   * If its code corresponds to a verified Commerce iPOS
   * dispatch but the round-trip link is not proven yet,
   * fail closed instead of granting independently.
   */
  if exists (
    select 1
    from public.cing_commerce_ipos_verified_identities_v1 i
    where 'ORD-' || i.foodbook_code =
      v_order.order_code
  ) then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'possible_commerce_order_requires_verified_link'
    );
  end if;

  select *
  into v_delivery
  from public.cing_crm_order_reward_delivery_v1 d
  where d.crm_order_id = v_order.id
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'crm_reward_snapshot_missing'
    );
  end if;

  /*
   * Snapshot must describe the same immutable CRM order.
   */
  if v_delivery.order_code is distinct from v_order.order_code
     or v_delivery.user_id is distinct from v_order.user_id
     or v_delivery.order_amount is distinct from v_order.order_amount
     or v_delivery.spend_per_play is null
     or v_delivery.spend_per_play <= 0
  then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'crm_reward_snapshot_conflict'
    );
  end if;

  if v_delivery.captured_at < v_cutover then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'pre_cutover_crm_entitlement_reconciliation_required'
    );
  end if;

  v_user := btrim(coalesce(v_order.user_id, ''));

  if v_user ~ '^84[0-9]{9}$' then
    v_user := '0' || substr(v_user, 3);
  end if;

  if v_user = '' then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'crm_reward_owner_missing'
    );
  end if;

  v_amount := v_order.order_amount;
  v_price := v_delivery.spend_per_play;

  if v_amount is null or v_amount < 0 then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'crm_reward_amount_invalid'
    );
  end if;

  v_quantity_numeric :=
    floor(v_amount::numeric / v_price::numeric);

  if v_quantity_numeric > 2147483647 then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'crm_reward_overflow'
    );
  end if;

  /*
   * A legacy award for this CRM order excludes V2 grant.
   */
  select count(*)
  into v_legacy_count
  from public.game_play_transactions t
  where t.reference_type = 'order_spending'
    and (
      t.metadata ->> 'crm_order_id' = v_order.id::text
      or t.metadata ->> 'order_code' = v_order.order_code
    );

  if v_legacy_count > 0 then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'legacy_crm_reward_already_recorded'
    );
  end if;

  if v_quantity_numeric = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'below_threshold',
      'credits', 0
    );
  end if;

  v_quantity := v_quantity_numeric::integer;

  v_metadata := jsonb_build_object(
    'authority', 'cing_bridge_crm_award_revive_v1',
    'crm_order_id', v_order.id,
    'order_code', v_order.order_code,
    'eligible_amount', v_amount,
    'spend_per_play', v_price,
    'snapshot_captured_at', v_delivery.captured_at,
    'cutover_at', v_cutover
  );

  select *
  into v_result
  from public.cing_revive_credit_apply_private_v1(
    v_user,
    v_quantity,
    'CRM/iPOS order spending Revive Credit V2',
    'crm_order_spending_v2',
    v_order.id::text,
    null::text,
    null::uuid,
    v_metadata
  );

  if v_result.transaction_id is null
     or v_result.balance_after is null
  then
    raise exception 'BRIDGE_CRM_GRANT_INVALID'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'status',
      case
        when v_result.applied then 'awarded'
        else 'replayed'
      end,
    'crm_order_id', v_order.id,
    'credits', v_quantity,
    'transaction_id', v_result.transaction_id,
    'balance_after', v_result.balance_after
  );
end;
$fn$;

revoke all
on function
public.cing_bridge_crm_award_revive_v1(bigint)
from public, anon, authenticated, service_role;


/*
 * V2 recovery batch.
 *
 * Uses the existing immutable CRM reward-delivery admission
 * table, but does NOT mark rows as awarded here.
 * Durable completion remains the Revive Credit ledger itself.
 *
 * No EXECUTE grant until release cutover is authorized.
 */
create function
public.cing_bridge_crm_revive_recover_batch_v1(
  p_batch_size integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_row public.cing_crm_order_reward_delivery_v1%rowtype;
  v_result jsonb;
  v_status text;

  v_checked integer := 0;
  v_awarded integer := 0;
  v_replayed integer := 0;
  v_skipped integer := 0;
  v_review integer := 0;
  v_deferred integer := 0;
begin
  if p_batch_size is null
     or p_batch_size < 1
     or p_batch_size > 100
  then
    raise exception 'BRIDGE_CRM_BATCH_SIZE_INVALID'
      using errcode = '22023';
  end if;

  for v_row in
    select d.*
    from public.cing_crm_order_reward_delivery_v1 d
    where d.status in ('pending', 'deferred')
      and d.next_retry_at <= clock_timestamp()
    order by d.captured_at, d.crm_order_id
    limit p_batch_size
    for update skip locked
  loop
    v_checked := v_checked + 1;

    v_result :=
      public.cing_bridge_crm_award_revive_v1(
        v_row.crm_order_id
      );

    v_status :=
      coalesce(v_result ->> 'status', 'review_required');

    /*
     * Durable queue state mirrors the Revive authority result.
     * Revive ledger remains the resource authority.
     */
    if v_status = 'awarded' then
      update public.cing_crm_order_reward_delivery_v1
      set
        status = 'awarded',
        attempts = attempts + 1,
        last_reason = coalesce(
          v_result ->> 'reason',
          'revive_credit_awarded'
        ),
        last_attempt_at = clock_timestamp(),
        delivered_at = clock_timestamp()
      where crm_order_id = v_row.crm_order_id;

      v_awarded := v_awarded + 1;

    elsif v_status = 'replayed' then
      update public.cing_crm_order_reward_delivery_v1
      set
        status = 'replayed',
        attempts = attempts + 1,
        last_reason = coalesce(
          v_result ->> 'reason',
          'revive_credit_replayed'
        ),
        last_attempt_at = clock_timestamp(),
        delivered_at = clock_timestamp()
      where crm_order_id = v_row.crm_order_id;

      v_replayed := v_replayed + 1;

    elsif v_status = 'skipped' then
      update public.cing_crm_order_reward_delivery_v1
      set
        status = 'skipped',
        attempts = attempts + 1,
        last_reason = coalesce(
          v_result ->> 'reason',
          'revive_credit_skipped'
        ),
        last_attempt_at = clock_timestamp(),
        delivered_at = clock_timestamp()
      where crm_order_id = v_row.crm_order_id;

      v_skipped := v_skipped + 1;

    elsif v_status = 'deferred' then
      update public.cing_crm_order_reward_delivery_v1
      set
        status = 'deferred',
        attempts = attempts + 1,
        last_reason = coalesce(
          v_result ->> 'reason',
          'revive_credit_deferred'
        ),
        last_attempt_at = clock_timestamp(),
        next_retry_at =
          clock_timestamp() + interval '5 minutes'
      where crm_order_id = v_row.crm_order_id;

      v_deferred := v_deferred + 1;

    else
      update public.cing_crm_order_reward_delivery_v1
      set
        status = 'review',
        attempts = attempts + 1,
        last_reason = coalesce(
          v_result ->> 'reason',
          'revive_credit_review_required'
        ),
        last_attempt_at = clock_timestamp()
      where crm_order_id = v_row.crm_order_id;

      v_review := v_review + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'checked', v_checked,
    'awarded', v_awarded,
    'replayed', v_replayed,
    'skipped', v_skipped,
    'review', v_review,
    'deferred', v_deferred
  );
end;
$fn$;

revoke all
on function
public.cing_bridge_crm_revive_recover_batch_v1(integer)
from public, anon, authenticated, service_role;

commit;
