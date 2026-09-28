begin;

/*
 * CING GAME CENTER V2
 * LEGACY ORDER ENTITLEMENT MULTI-SOURCE IDENTITY V1
 *
 * One verified economic entitlement may have
 * multiple independently observed source identities.
 *
 * Each source identity belongs to at most one
 * entitlement snapshot.
 *
 * This table does NOT infer source equivalence.
 * A future database-owned RPC must establish
 * equivalence using authoritative evidence.
 *
 * This migration does NOT:
 * - insert any identity or snapshot
 * - update an existing snapshot
 * - award game plays
 * - grant Revive Credits
 * - debit Wallet or loyalty points
 * - set a cutover timestamp
 * - close a legacy writer
 * - call iPOS
 * - grant table-write access to service_role
 */

create table public.cing_legacy_order_entitlement_source_identities (

  id uuid
    primary key
    default gen_random_uuid(),

  snapshot_id uuid
    not null
    references
      public.cing_legacy_order_entitlement_snapshots(id)
    on update restrict
    on delete restrict,

  /*
   * Examples of source namespaces may eventually
   * include Commerce orders and verified iPOS records.
   *
   * No source is automatically considered equivalent
   * to another merely because order codes, amount,
   * phone or ingestion time resemble each other.
   */
  source_system text
    not null,

  source_reference text
    not null,

  /*
   * This record represents an established link,
   * not an unverified candidate match.
   *
   * Future mutation authority must validate
   * the evidence before inserting this row.
   */
  verification_method text
    not null,

  verification_reference text
    not null,

  /*
   * Explicitly limited to a small, allowlisted
   * evidence projection by a future RPC.
   *
   * No raw webhook payload, provider credential,
   * customer secret or sensitive token.
   */
  evidence_summary jsonb
    not null
    default '{}'::jsonb,

  verified_at timestamptz
    not null
    default clock_timestamp(),

  created_at timestamptz
    not null
    default clock_timestamp(),

  constraint cing_legacy_source_identity_system_ck
    check (
      btrim(source_system) <> ''
    ),

  constraint cing_legacy_source_identity_reference_ck
    check (
      btrim(source_reference) <> ''
    ),

  constraint cing_legacy_source_identity_method_ck
    check (
      btrim(verification_method) <> ''
    ),

  constraint cing_legacy_source_identity_proof_ck
    check (
      btrim(verification_reference) <> ''
    ),

  constraint cing_legacy_source_identity_evidence_ck
    check (
      jsonb_typeof(evidence_summary) = 'object'
    )

);

/*
 * One identity cannot be linked to two snapshots.
 *
 * Race protection is database-enforced, not
 * a Node check-before-insert.
 */
create unique index
  cing_legacy_source_identity_unique_source_uq
on public.cing_legacy_order_entitlement_source_identities (
  source_system,
  source_reference
);

/*
 * Avoid duplicate identity rows within the same
 * economic entitlement as well.
 */
create unique index
  cing_legacy_source_identity_snapshot_source_uq
on public.cing_legacy_order_entitlement_source_identities (
  snapshot_id,
  source_system,
  source_reference
);

/*
 * Supports examination of every proven source
 * linked to one canonical entitlement.
 */
create index
  cing_legacy_source_identity_snapshot_idx
on public.cing_legacy_order_entitlement_source_identities (
  snapshot_id,
  created_at
);

/*
 * Read-only backend exposure.
 *
 * A future privileged RPC must own inserts and
 * explicitly validate evidence and conflicts.
 */
revoke all
on table
  public.cing_legacy_order_entitlement_source_identities
from public;

revoke all
on table
  public.cing_legacy_order_entitlement_source_identities
from anon;

revoke all
on table
  public.cing_legacy_order_entitlement_source_identities
from authenticated;

revoke all
on table
  public.cing_legacy_order_entitlement_source_identities
from service_role;

grant select
on table
  public.cing_legacy_order_entitlement_source_identities
to service_role;

commit;
