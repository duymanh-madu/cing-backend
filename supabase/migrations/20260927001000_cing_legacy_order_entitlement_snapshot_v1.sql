begin;

/*
 * CING GAME CENTER V2
 * LEGACY ORDER ENTITLEMENT SNAPSHOT FOUNDATION V1
 *
 * Dormant evidence and reconciliation storage.
 *
 * This migration DOES NOT:
 * - create or award game plays
 * - convert game plays into Revive Credits
 * - debit Wallet or loyalty points
 * - call iPOS
 * - close legacy writer gate
 * - set a production cutover timestamp
 * - grant write access to service_role
 *
 * Actual snapshot creation and reconciliation require
 * a later bounded database-owned authority.
 */

create table public.cing_legacy_order_entitlement_snapshots (

  id uuid
    primary key
    default gen_random_uuid(),

  /*
   * Shared order identity resolved by a trusted backend
   * authority. Prevent Commerce and CRM/iPOS from creating
   * separate entitlements for the same canonical order.
   *
   * Do not derive this from raw webhook fields alone.
   */
  canonical_order_key text
    not null,

  source_system text
    not null,

  source_reference text
    not null,

  user_id text,

  /*
   * Production cutover has not been established yet.
   * Review records may be incomplete.
   */
  cutover_at timestamptz,

  entitlement_at timestamptz,

  entitlement_time_source text,

  evidence_verified boolean
    not null
    default false,

  historical_spend_per_play bigint,

  eligible_order_amount bigint,

  expected_plays integer,

  already_awarded_plays integer
    not null
    default 0,

  outstanding_plays integer,

  decision text
    not null
    default 'review_required',

  review_reason text,

  /*
   * Source evidence must not contain customer secrets,
   * provider tokens or entire webhook payloads.
   *
   * A later authority will define bounded allowlisted
   * evidence fields.
   */
  source_evidence jsonb
    not null
    default '{}'::jsonb,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint cing_legacy_entitlement_canonical_key_ck
    check (
      btrim(canonical_order_key) <> ''
    ),

  constraint cing_legacy_entitlement_source_system_ck
    check (
      btrim(source_system) <> ''
    ),

  constraint cing_legacy_entitlement_source_reference_ck
    check (
      btrim(source_reference) <> ''
    ),

  constraint cing_legacy_entitlement_user_id_ck
    check (
      user_id is null
      or btrim(user_id) <> ''
    ),

  constraint cing_legacy_entitlement_time_source_ck
    check (
      entitlement_time_source is null
      or btrim(entitlement_time_source) <> ''
    ),

  constraint cing_legacy_entitlement_threshold_ck
    check (
      historical_spend_per_play is null
      or historical_spend_per_play > 0
    ),

  constraint cing_legacy_entitlement_amount_ck
    check (
      eligible_order_amount is null
      or eligible_order_amount >= 0
    ),

  constraint cing_legacy_entitlement_expected_ck
    check (
      expected_plays is null
      or expected_plays >= 0
    ),

  constraint cing_legacy_entitlement_awarded_ck
    check (
      already_awarded_plays >= 0
    ),

  constraint cing_legacy_entitlement_outstanding_ck
    check (
      outstanding_plays is null
      or outstanding_plays >= 0
    ),

  constraint cing_legacy_entitlement_decision_ck
    check (
      decision in (
        'review_required',
        'already_awarded',
        'eligible_for_reconciliation',
        'below_threshold',
        'post_cutover'
      )
    ),

  constraint cing_legacy_entitlement_review_reason_ck
    check (
      review_reason is null
      or btrim(review_reason) <> ''
    ),

  /*
   * Counts are stored snapshots, not instructions to
   * mutate a balance.
   */
  constraint cing_legacy_entitlement_counts_ck
    check (
      expected_plays is null
      or (
        already_awarded_plays <= expected_plays
        and outstanding_plays is not null
        and outstanding_plays =
          expected_plays - already_awarded_plays
      )
    ),

  constraint cing_legacy_entitlement_eligible_ck
    check (
      decision <> 'eligible_for_reconciliation'
      or (
        evidence_verified is true
        and cutover_at is not null
        and entitlement_at is not null
        and entitlement_at < cutover_at
        and historical_spend_per_play is not null
        and eligible_order_amount is not null
        and expected_plays is not null
        and expected_plays > 0
        and outstanding_plays is not null
        and outstanding_plays > 0
      )
    ),

  constraint cing_legacy_entitlement_below_threshold_ck
    check (
      decision <> 'below_threshold'
      or (
        expected_plays = 0
        and already_awarded_plays = 0
        and outstanding_plays = 0
      )
    ),

  constraint cing_legacy_entitlement_post_cutover_ck
    check (
      decision <> 'post_cutover'
      or (
        cutover_at is not null
        and entitlement_at is not null
        and entitlement_at >= cutover_at
        and already_awarded_plays = 0
        and outstanding_plays is null
      )
    ),

  constraint cing_legacy_entitlement_awarded_decision_ck
    check (
      decision <> 'already_awarded'
      or (
        expected_plays is not null
        and expected_plays > 0
        and already_awarded_plays = expected_plays
        and outstanding_plays = 0
      )
    ),

  constraint cing_legacy_entitlement_evidence_shape_ck
    check (
      jsonb_typeof(source_evidence) = 'object'
    )

);

/*
 * One canonical order -> at most one entitlement
 * snapshot, regardless of discovery path.
 */
create unique index
  cing_legacy_entitlement_canonical_order_uq
on public.cing_legacy_order_entitlement_snapshots (
  canonical_order_key
);

/*
 * Prevent the same source identity being independently
 * claimed again under another canonical key.
 */
create unique index
  cing_legacy_entitlement_source_identity_uq
on public.cing_legacy_order_entitlement_snapshots (
  source_system,
  source_reference
);

create index
  cing_legacy_entitlement_review_idx
on public.cing_legacy_order_entitlement_snapshots (
  decision,
  created_at
);

/*
 * Backend may read snapshots.
 * No direct table write permission is granted here.
 */
revoke all
on table public.cing_legacy_order_entitlement_snapshots
from public;

revoke all
on table public.cing_legacy_order_entitlement_snapshots
from anon;

revoke all
on table public.cing_legacy_order_entitlement_snapshots
from authenticated;

revoke all
on table public.cing_legacy_order_entitlement_snapshots
from service_role;

grant select
on table public.cing_legacy_order_entitlement_snapshots
to service_role;

commit;
