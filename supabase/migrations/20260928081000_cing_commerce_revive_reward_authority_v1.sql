begin;

/*
 * CING BRIDGE V2 — COMMERCE REVIVE REWARD AUTHORITY
 *
 * Dormant installation:
 * - No EXECUTE granted to service_role.
 * - Cutover timestamp initially NULL.
 * - No historical backfill.
 * - No legacy game_plays, Wallet or loyalty mutation.
 * - No iPOS call.
 *
 * Commerce grants are conditional on independent database
 * evidence, never caller-provided payment or price flags.
 */

do $pre$
begin
  if to_regclass(
    'public.cing_commerce_payment_intent_reward_snapshots_v1'
  ) is null
  or to_regclass(
    'public.cing_commerce_ipos_verified_identities_v1'
  ) is null
  or to_regclass(
    'public.cing_legacy_game_plays_writer_gate'
  ) is null
  or to_regprocedure(
    'public.cing_revive_credit_apply_private_v1(text,integer,text,text,text,text,uuid,jsonb)'
  ) is null
  then
    raise exception
      'CING_BRIDGE_COMMERCE_REWARD_DEPENDENCY_MISSING';
  end if;
end;
$pre$;

/*
 * Explicit operational cutover evidence.
 *
 * This migration cannot activate rewards. A separate,
 * approved cutover operation must set this timestamp
 * consistently with legacy writer closure.
 */
create table public.cing_bridge_v2_reward_cutover (
  singleton boolean primary key
    default true
    check (singleton is true),

  cutover_at timestamptz,

  created_at timestamptz not null
    default clock_timestamp()
);

insert into public.cing_bridge_v2_reward_cutover (
  singleton,
  cutover_at
)
values (true, null);

revoke all
on public.cing_bridge_v2_reward_cutover
from public, anon, authenticated, service_role;

create or replace function
public.cing_bridge_commerce_award_revive_v1(
  p_order_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_order public.orders%rowtype;
  v_payment public.payment_transactions%rowtype;
  v_price
    public.cing_commerce_payment_intent_reward_snapshots_v1%rowtype;
  v_identity
    public.cing_commerce_ipos_verified_identities_v1%rowtype;
  v_cutover timestamptz;
  v_gate_closed boolean;
  v_user text;
  v_amount bigint;
  v_quantity_numeric numeric;
  v_quantity integer;
  v_legacy_count bigint;
  v_crm_count bigint;
  v_existing_count bigint;
  v_reference text;
  v_metadata jsonb;
  v_result record;
begin
  if p_order_id is null then
    raise exception 'BRIDGE_COMMERCE_ORDER_ID_REQUIRED'
      using errcode = '22023';
  end if;

  /*
   * Lock cutover gate first. No grant while legacy
   * game_plays writers remain open.
   */
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

  /*
   * Same canonical Commerce order lock used by
   * existing order-spend award authority.
   */
  select *
    into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'commerce_order_missing'
    );
  end if;

  select *
    into v_payment
  from public.payment_transactions p
  where p.id = v_order.payment_transaction_id
    and p.order_id = v_order.id
    and p.order_created is true
    and p.payment_status = 'paid'
    and p.payment_purpose = 'order'
  for share;

  if not found
     or v_order.payment_status is distinct from 'paid'
  then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'commerce_payment_link_unverified'
    );
  end if;

  /*
   * Intent must belong to the V2 economic period.
   * A pre-cutover intent paid later requires review;
   * it cannot be silently reclassified or repriced.
   *
   * Paid_at is payment event evidence; intent_created_at
   * is price snapshot evidence. They are not interchangeable.
   */
  select *
    into v_price
  from
    public.cing_commerce_payment_intent_reward_snapshots_v1 s
  where s.payment_transaction_id = v_payment.id::text
    and s.transaction_code = v_payment.transaction_code;

  if not found
     or v_price.snapshot_status is distinct from 'valid'
     or v_price.spend_per_play is null
     or v_price.spend_per_play <= 0
     or v_price.intent_created_at is null
     or v_payment.paid_at is null
  then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'payment_price_or_time_evidence_missing'
    );
  end if;

  if v_price.intent_created_at < v_cutover
     or v_payment.paid_at < v_cutover
  then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'pre_cutover_entitlement_reconciliation_required'
    );
  end if;

  /*
   * Do not infer cross-source identity from a similar
   * phone number, amount or order-code suffix.
   */
  select *
    into v_identity
  from public.cing_commerce_ipos_verified_identities_v1 i
  where i.commerce_order_id = v_order.id;

  if not found then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'verified_ipos_source_identity_missing'
    );
  end if;

  v_user := btrim(coalesce(v_order.user_id, ''));

  if v_user = ''
     or v_payment.user_id is distinct from v_user
  then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'commerce_reward_owner_mismatch'
    );
  end if;

  /*
   * Preserve the existing Commerce reward basis:
   * paid order total_amount, not caller-supplied amount
   * or a later Admin configuration.
   */
  v_amount := v_order.total_amount;

  if v_amount is null or v_amount < 0 then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'commerce_reward_amount_invalid'
    );
  end if;

  v_quantity_numeric :=
    floor(
      v_amount::numeric /
      v_price.spend_per_play::numeric
    );

  if v_quantity_numeric > 2147483647 then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'commerce_reward_overflow'
    );
  end if;

  /*
   * A historical Commerce OR CRM award excludes
   * a second grant for the same known order identities.
   *
   * The legacy writer gate is closed and locked above,
   * so a concurrent legacy award cannot be committed
   * after this exclusion check.
   */
  select count(*)
    into v_legacy_count
  from public.game_play_transactions t
  where t.reference_type = 'order_spending'
    and (
      t.reference_id = v_order.id::text
      or t.metadata ->> 'order_code' = v_order.order_code
      or t.metadata ->> 'order_code' =
        'ORD-' || v_identity.foodbook_code
    );

  if v_legacy_count > 0 then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'legacy_order_reward_already_recorded'
    );
  end if;

  /*
   * A CRM record that may correspond to this external
   * identity must be reconciled, not automatically treated
   * as independent and granted a second reward.
   */
  select count(*)
    into v_crm_count
  from public.crm_orders c
  where c.order_code =
    'ORD-' || v_identity.foodbook_code;

  if v_crm_count > 1 then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'crm_order_identity_ambiguous'
    );
  end if;

  /*
   * If iPOS/CRM observed the same external identity,
   * a verified round-trip Bridge link is mandatory.
   *
   * String similarity alone is never sufficient.
   */
  if v_crm_count = 1 and not exists (
    select 1
    from public.cing_bridge_commerce_crm_links_v1 l
    join public.crm_orders c
      on c.id = l.crm_order_id
    where l.commerce_order_id = v_order.id
      and l.foodbook_code = v_identity.foodbook_code
      and c.order_code =
        'ORD-' || v_identity.foodbook_code
  ) then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'crm_commerce_source_link_unverified'
    );
  end if;

  /*
   * Existing V2 ledger is the durable replay authority.
   * The private grant also validates exact metadata.
   */
  v_reference := v_order.id::text;

  select count(*)
    into v_existing_count
  from public.cing_revive_credit_transactions t
  where t.reference_type =
      'commerce_order_spending_v2'
    and t.reference_id = v_reference;

  if v_existing_count > 1 then
    return jsonb_build_object(
      'status', 'review_required',
      'reason', 'multiple_revive_reward_receipts'
    );
  end if;

  if v_quantity_numeric = 0 then
    if v_existing_count > 0 then
      return jsonb_build_object(
        'status', 'review_required',
        'reason', 'below_threshold_with_existing_grant'
      );
    end if;

    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'below_threshold',
      'credits', 0
    );
  end if;

  v_quantity := v_quantity_numeric::integer;

  v_metadata := jsonb_build_object(
    'authority', 'cing_bridge_commerce_award_revive_v1',
    'commerce_order_id', v_order.id,
    'payment_transaction_id', v_payment.id,
    'foodbook_code', v_identity.foodbook_code,
    'eligible_amount', v_amount,
    'spend_per_play', v_price.spend_per_play,
    'intent_created_at', v_price.intent_created_at,
    'cutover_at', v_cutover
  );

  select *
    into v_result
  from public.cing_revive_credit_apply_private_v1(
    v_user,
    v_quantity,
    'Commerce order spending Revive Credit V2',
    'commerce_order_spending_v2',
    v_reference,
    null::text,
    null::uuid,
    v_metadata
  );

  if v_result.transaction_id is null
     or v_result.balance_after is null
  then
    raise exception 'BRIDGE_COMMERCE_GRANT_INVALID'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'status',
      case when v_result.applied
        then 'awarded'
        else 'replayed'
      end,
    'commerce_order_id', v_order.id,
    'credits', v_quantity,
    'transaction_id', v_result.transaction_id,
    'balance_after', v_result.balance_after
  );
end;
$fn$;

/*
 * Dormant until:
 * - verified CRM/Commerce linking authority,
 * - complete CRM delivery integration,
 * - PostgreSQL replay/concurrency tests,
 * - approved operational cutover.
 */
revoke all
on function
public.cing_bridge_commerce_award_revive_v1(bigint)
from public, anon, authenticated, service_role;

commit;
