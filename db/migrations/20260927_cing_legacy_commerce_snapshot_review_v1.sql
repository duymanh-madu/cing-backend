begin;

/*
 * CING GAME CENTER V2 — AE.1
 *
 * COMMERCE REVIEW-ONLY ENTITLEMENT SNAPSHOT
 *
 * Input: canonical Commerce order ID only.
 *
 * The database resolves:
 * - paid order and linked paid payment transaction;
 * - canonical user;
 * - existing order_spending ledger;
 * - source identity and immutable snapshot.
 *
 * The absence of a game-play ledger DOES NOT prove
 * that a legacy Node award never happened.
 *
 * No cutover date is inferred.
 * No current spend_per_play is used.
 * No outstanding_plays are manufactured.
 * No game plays or Revive Credits are granted.
 *
 * No EXECUTE grant is made to service_role.
 */

create function
public.cing_legacy_commerce_order_snapshot_review_v1(
  p_order_id bigint
)
returns table (
  snapshot_id uuid,
  snapshot_decision text,
  applied boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;

  v_payment
    public.payment_transactions%rowtype;

  v_ledger
    public.game_play_transactions%rowtype;

  v_snapshot
    public.cing_legacy_order_entitlement_snapshots%rowtype;

  v_identity
    public.cing_legacy_order_entitlement_source_identities%rowtype;

  v_user_id text;
  v_order_ref text;
  v_key text;

  v_decision text;
  v_reason text;
  v_awarded integer;
  v_expected integer;
  v_outstanding integer;

  v_evidence jsonb;

  v_snapshot_id uuid;
begin

  if p_order_id is null or p_order_id <= 0 then
    raise exception
      'CING_LEGACY_COMMERCE_ORDER_ID_INVALID'
      using errcode = '22023';
  end if;

  /*
   * Match Commerce's authoritative order lock.
   * This serializes two snapshot attempts for
   * the same durable Commerce order.
   */
  select o.*
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception
      'CING_LEGACY_COMMERCE_ORDER_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if
    v_order.payment_status <> 'paid'
    or v_order.payment_transaction_id is null
  then
    raise exception
      'CING_LEGACY_COMMERCE_ORDER_NOT_PAID'
      using errcode = '55000';
  end if;

  /*
   * Verify exact bidirectional payment linkage.
   * Do not accept an unrelated paid transaction.
   */
  select p.*
  into v_payment
  from public.payment_transactions p
  where p.id = v_order.payment_transaction_id
    and p.order_created is true
    and p.order_id = v_order.id
    and p.payment_status = 'paid'
    and p.payment_purpose = 'order';

  if not found then
    raise exception
      'CING_LEGACY_COMMERCE_PAYMENT_LINK_INVALID'
      using errcode = '55000';
  end if;

  v_user_id :=
    nullif(
      btrim(
        coalesce(
          nullif(v_order.user_id, ''),
          nullif(v_order.customer_phone, ''),
          ''
        )
      ),
      ''
    );

  if v_user_id is null then
    raise exception
      'CING_LEGACY_COMMERCE_USER_MISSING'
      using errcode = '55000';
  end if;

  v_order_ref := v_order.id::text;

  v_key :=
    'commerce_order:' || v_order_ref;

  /*
   * A valid durable ledger proves an award.
   *
   * Missing ledger is NOT proof of zero
   * historical awards, because legacy Node
   * awards may have used analytics_events.
   */
  select t.*
  into v_ledger
  from public.game_play_transactions t
  where t.reference_type = 'order_spending'
    and t.reference_id = v_order_ref;

  if found then

    if
      v_ledger.user_id <> v_user_id
      or v_ledger.transaction_type <> 'add'
      or v_ledger.amount <= 0
      or v_ledger.balance_after <>
        v_ledger.balance_before + v_ledger.amount
    then
      raise exception
        'CING_LEGACY_COMMERCE_AWARD_LEDGER_CONFLICT'
        using errcode = '55000';
    end if;

    v_decision := 'already_awarded';
    v_reason := 'durable_award_exists';

    v_awarded := v_ledger.amount;
    v_expected := v_ledger.amount;
    v_outstanding := 0;

  else

    v_decision := 'review_required';

    v_reason :=
      'ledger_absent_legacy_award_reconciliation_required';

    v_awarded := 0;
    v_expected := null;
    v_outstanding := null;

  end if;

  /*
   * Do not pretend that payment.paid_at
   * establishes the original external
   * settlement instant in all cases.
   *
   * Only allowlisted identifiers are stored;
   * no raw payment or webhook payloads.
   */
  v_evidence := pg_catalog.jsonb_build_object(
    'commerce_order_id',
      v_order.id,
    'commerce_order_code',
      v_order.order_code,
    'payment_transaction_id',
      v_payment.id,
    'award_ledger_id',
      v_ledger.id
  );

  /*
   * Existing source identity is never
   * silently reassigned to a new snapshot.
   */
  select si.*
  into v_identity
  from public.cing_legacy_order_entitlement_source_identities si
  where si.source_system = 'commerce_order'
    and si.source_reference = v_order_ref
  for update;

  /*
   * Canonical key is resolved from database
   * order ID, not caller-supplied order_code.
   */
  select s.*
  into v_snapshot
  from public.cing_legacy_order_entitlement_snapshots s
  where s.canonical_order_key = v_key
  for update;

  if found then

    if
      v_snapshot.source_system <>
        'commerce_order'
      or v_snapshot.source_reference <>
        v_order_ref
      or v_snapshot.user_id is distinct from
        v_user_id
      or v_snapshot.decision <>
        v_decision
      or v_snapshot.review_reason is distinct from
        v_reason
      or v_snapshot.expected_plays is distinct from
        v_expected
      or v_snapshot.already_awarded_plays <>
        v_awarded
      or v_snapshot.outstanding_plays is distinct from
        v_outstanding
      or v_snapshot.source_evidence <>
        v_evidence
      or v_snapshot.cutover_at is not null
      or v_snapshot.entitlement_at is not null
      or v_snapshot.evidence_verified is not false
    then
      raise exception
        'CING_LEGACY_COMMERCE_SNAPSHOT_REPLAY_CONFLICT'
        using errcode = '55000';
    end if;

    if
      v_identity.id is null
      or v_identity.snapshot_id <>
        v_snapshot.id
      or v_identity.verification_method <>
        'commerce_payment_link'
      or v_identity.verification_reference <>
        v_payment.id::text
    then
      raise exception
        'CING_LEGACY_COMMERCE_SOURCE_IDENTITY_CONFLICT'
        using errcode = '55000';
    end if;

    return query
    select
      v_snapshot.id,
      v_snapshot.decision,
      false;

    return;

  end if;

  /*
   * An identity already attached to another
   * snapshot must not be reclaimed.
   */
  if v_identity.id is not null then
    raise exception
      'CING_LEGACY_COMMERCE_SOURCE_IDENTITY_CONFLICT'
      using errcode = '55000';
  end if;

  insert into
    public.cing_legacy_order_entitlement_snapshots (
      canonical_order_key,
      source_system,
      source_reference,
      user_id,
      cutover_at,
      entitlement_at,
      entitlement_time_source,
      evidence_verified,
      historical_spend_per_play,
      eligible_order_amount,
      expected_plays,
      already_awarded_plays,
      outstanding_plays,
      decision,
      review_reason,
      source_evidence
    )
  values (
    v_key,
    'commerce_order',
    v_order_ref,
    v_user_id,
    null,
    null,
    null,
    false,
    null,
    null,
    v_expected,
    v_awarded,
    v_outstanding,
    v_decision,
    v_reason,
    v_evidence
  )
  returning id
  into v_snapshot_id;

  /*
   * Both inserts belong to the same
   * PostgreSQL transaction.
   *
   * Any conflict rolls back both.
   */
  insert into
    public.cing_legacy_order_entitlement_source_identities (
      snapshot_id,
      source_system,
      source_reference,
      verification_method,
      verification_reference,
      evidence_summary
    )
  values (
    v_snapshot_id,
    'commerce_order',
    v_order_ref,
    'commerce_payment_link',
    v_payment.id::text,
    pg_catalog.jsonb_build_object(
      'commerce_order_id',
        v_order.id,
      'payment_transaction_id',
        v_payment.id
    )
  );

  return query
  select
    v_snapshot_id,
    v_decision,
    true;

end;
$function$;

/*
 * No API role may execute review creation.
 *
 * A later operational authority will authorize
 * a bounded reconciliation workflow.
 */
revoke all
on function
public.cing_legacy_commerce_order_snapshot_review_v1(
  bigint
)
from public, anon, authenticated, service_role;

commit;
