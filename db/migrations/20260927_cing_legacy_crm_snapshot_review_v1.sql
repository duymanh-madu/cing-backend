begin;

/*
 * CING GAME CENTER V2 — BLOCK 13-M.AF.3
 *
 * CRM REVIEW-ONLY HISTORICAL ENTITLEMENT SNAPSHOT
 *
 * Input:
 *   canonical public.crm_orders.id only.
 *
 * Database-owned checks:
 *   - CRM row exists and is processed;
 *   - amount is positive;
 *   - user and order code are nonblank;
 *   - no Commerce order already uses the same order code;
 *   - source identity is not claimed by another snapshot.
 *
 * No entitlement timestamp is inferred.
 * No historical spend threshold is inferred.
 * No analytics absence is treated as proof of no award.
 * No wallet or loyalty-point mutation.
 * No legacy game-play or Revive Credit mutation.
 *
 * The zero in already_awarded_plays for a review_required
 * snapshot is a provisional, unverified placeholder.
 * It is NOT evidence that the order received zero plays.
 *
 * This function must not be granted to API roles.
 */

create function
public.cing_legacy_crm_order_snapshot_review_v1(
  p_crm_order_id bigint
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

  v_crm
    public.crm_orders%rowtype;

  v_commerce_order_id bigint;

  v_snapshot
    public.cing_legacy_order_entitlement_snapshots%rowtype;

  v_identity
    public.cing_legacy_order_entitlement_source_identities%rowtype;

  v_user_id text;
  v_order_code text;
  v_crm_ref text;
  v_canonical_key text;

  v_evidence jsonb;
  v_identity_evidence jsonb;

  v_snapshot_id uuid;

  v_review_reason text :=
    'crm_historical_award_and_entitlement_review_required';

begin

  if
    p_crm_order_id is null
    or p_crm_order_id <= 0
  then
    raise exception
      'CING_LEGACY_CRM_ORDER_ID_INVALID'
      using errcode = '22023';
  end if;

  /*
   * Serialize competing review calls for
   * the same durable CRM row.
   */
  select c.*
  into v_crm
  from public.crm_orders c
  where c.id = p_crm_order_id
  for update;

  if not found then
    raise exception
      'CING_LEGACY_CRM_ORDER_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_crm.processed is not true then
    raise exception
      'CING_LEGACY_CRM_ORDER_NOT_PROCESSED'
      using errcode = '55000';
  end if;

  if
    v_crm.order_amount is null
    or v_crm.order_amount <= 0
  then
    raise exception
      'CING_LEGACY_CRM_ORDER_AMOUNT_INVALID'
      using errcode = '55000';
  end if;

  v_user_id :=
    nullif(
      btrim(
        coalesce(v_crm.user_id, '')
      ),
      ''
    );

  v_order_code :=
    nullif(
      btrim(
        coalesce(v_crm.order_code, '')
      ),
      ''
    );

  if v_user_id is null then
    raise exception
      'CING_LEGACY_CRM_USER_MISSING'
      using errcode = '55000';
  end if;

  if v_order_code is null then
    raise exception
      'CING_LEGACY_CRM_ORDER_CODE_MISSING'
      using errcode = '55000';
  end if;

  /*
   * A matching Commerce order code is NOT,
   * by itself, proof that both rows represent
   * the same economic transaction.
   *
   * Do not create a second independent
   * entitlement in this ambiguous case.
   *
   * The later cross-source authority must
   * establish the link using stronger proof.
   */
  select o.id
  into v_commerce_order_id
  from public.orders o
  where o.order_code = v_order_code
  order by o.id
  limit 1;

  if v_commerce_order_id is not null then
    raise exception
      'CING_LEGACY_CRM_COMMERCE_IDENTITY_REVIEW_REQUIRED'
      using errcode = '55000';
  end if;

  v_crm_ref := v_crm.id::text;

  v_canonical_key :=
    'crm_order:' || v_crm_ref;

  /*
   * Store only a bounded evidence projection.
   * Do not persist raw CRM/iPOS payloads,
   * webhook contents or customer secrets.
   */
  v_evidence :=
    pg_catalog.jsonb_build_object(
      'crm_order_id',
        v_crm.id,
      'crm_order_code',
        v_order_code,
      'crm_order_amount',
        v_crm.order_amount,
      'crm_source',
        v_crm.source,
      'crm_processed',
        true
    );

  v_identity_evidence :=
    pg_catalog.jsonb_build_object(
      'crm_order_id',
        v_crm.id,
      'crm_order_code',
        v_order_code
    );

  /*
   * A source identity already belonging to
   * another snapshot cannot be reclaimed.
   */
  select si.*
  into v_identity
  from public.cing_legacy_order_entitlement_source_identities si
  where si.source_system = 'crm_order'
    and si.source_reference = v_crm_ref
  for update;

  select s.*
  into v_snapshot
  from public.cing_legacy_order_entitlement_snapshots s
  where s.canonical_order_key = v_canonical_key
  for update;

  if found then

    if
      v_snapshot.source_system <>
        'crm_order'

      or v_snapshot.source_reference <>
        v_crm_ref

      or v_snapshot.user_id is distinct from
        v_user_id

      or v_snapshot.decision <>
        'review_required'

      or v_snapshot.review_reason is distinct from
        v_review_reason

      or v_snapshot.cutover_at is not null

      or v_snapshot.entitlement_at is not null

      or v_snapshot.entitlement_time_source is not null

      or v_snapshot.evidence_verified is not false

      or v_snapshot.historical_spend_per_play is not null

      or v_snapshot.eligible_order_amount is not null

      or v_snapshot.expected_plays is not null

      or v_snapshot.already_awarded_plays <> 0

      or v_snapshot.outstanding_plays is not null

      or v_snapshot.source_evidence <>
        v_evidence

    then
      raise exception
        'CING_LEGACY_CRM_SNAPSHOT_REPLAY_CONFLICT'
        using errcode = '55000';
    end if;

    if
      v_identity.id is null

      or v_identity.snapshot_id <>
        v_snapshot.id

      or v_identity.verification_method <>
        'crm_processed_row_review_only'

      or v_identity.verification_reference <>
        v_crm_ref

      or v_identity.evidence_summary <>
        v_identity_evidence

    then
      raise exception
        'CING_LEGACY_CRM_SOURCE_IDENTITY_CONFLICT'
        using errcode = '55000';
    end if;

    return query
    select
      v_snapshot.id,
      v_snapshot.decision,
      false;

    return;

  end if;

  if v_identity.id is not null then
    raise exception
      'CING_LEGACY_CRM_SOURCE_IDENTITY_CONFLICT'
      using errcode = '55000';
  end if;

  /*
   * The CRM row is durable and processed,
   * but the historical play entitlement
   * remains UNVERIFIED.
   *
   * In particular:
   *   expected_plays = NULL;
   *   outstanding_plays = NULL;
   *   evidence_verified = FALSE.
   */
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
    v_canonical_key,
    'crm_order',
    v_crm_ref,
    v_user_id,
    null,
    null,
    null,
    false,
    null,
    null,
    null,
    0,
    null,
    'review_required',
    v_review_reason,
    v_evidence
  )
  returning id
  into v_snapshot_id;

  /*
   * Snapshot and identity are inserted
   * in the same PostgreSQL transaction.
   *
   * Any exception rolls back both.
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
    'crm_order',
    v_crm_ref,
    'crm_processed_row_review_only',
    v_crm_ref,
    v_identity_evidence
  );

  return query
  select
    v_snapshot_id,
    'review_required'::text,
    true;

end;
$function$;

/*
 * RPC installed dormant.
 *
 * No service_role, anon or authenticated
 * EXECUTE authority.
 */
revoke all
on function
public.cing_legacy_crm_order_snapshot_review_v1(
  bigint
)
from public, anon, authenticated, service_role;

commit;
