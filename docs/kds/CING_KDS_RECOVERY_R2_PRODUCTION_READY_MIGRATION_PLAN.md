# CING KDS Pro — Recovery R2 Production-Ready Migration Plan

Status: **SOURCE-ONLY DESIGN — Production HOLD**

R2 replaces the earlier idea of executing the original draft migrations. It
does not create, alter, grant, revoke, mount, schedule, deploy, or execute
anything in Production.

## Immutable starting point

Production already contains these empty, contained draft objects:

- seven tables: `cing_kds_orders`, `cing_kds_cups`,
  `cing_kds_cup_audit`, `cing_kds_sla_policies`, `cing_kds_alerts`,
  `cing_kds_event_inbox`, and `cing_kds_inbox_conflicts`;
- one non-executable function:
  `cing_kds_receive_event11_atomic_v1`.

The original eight `20261002`/`20261015` KDS migration files remain source
references only. They are forbidden from Production execution and must not be
adopted into a migration runner history.

## R2 gate zero: adoption preflight

Before any new KDS migration is reviewed for Production, execute the separate
read-only SQL artifact:

`docs/kds/sql/CING_KDS_RECOVERY_R2_ADOPTION_PREFLIGHT_V1.sql`

It passes only if:

1. the seven known tables and the known ingestion function exist;
2. every known table is empty and has RLS enabled;
3. `anon`, `authenticated`, and `service_role` have no direct `SELECT` access
   to those tables;
4. the known function has no execute access for those roles;
5. no non-internal KDS trigger exists; and
6. none of the five unapproved draft-phase objects exist.

Any deviation is a HOLD. No future migration may use `IF NOT EXISTS` to hide a
preflight failure or overwrite a pre-existing object.

## Future Production-ready series (not created in R2)

Each item below requires a new timestamp, a new review, byte-identical
`db/migrations` and `supabase/migrations` copies, source tests, an explicit
Production authorization, and a fresh checksum record.

| Order | Future migration purpose | Required property |
| --- | --- | --- |
| P0 | Adoption guard | Re-runs the R2 baseline checks and records no hidden assumption. |
| P1 | C04 raw event authority | Idempotent source event identity; no payment or readiness authority. |
| P2 | Token-fenced branch runtime authority | Lease/checkpoint only; direct table access remains revoked. |
| P3 | Durable C03 reconciliation queue | Pending/review/ready states with exact retry ownership. |
| P4 | Restricted RPC grants | Only required RPCs, only after P1–P3 prove RLS/search-path/grant posture. |
| P5 | One-shot controlled proof | Explicit branch scope, finite deadline, aggregate/redacted evidence, no scheduler. |

P0–P5 are a design sequence, not authorization to write those migrations now.

## Release gates remain unchanged

No series may progress beyond controlled proof until all three gates have
written evidence for the same window:

1. measured realtime latency/load/recovery;
2. zero missing and zero extra invoices; and
3. exact iPOS item identity, per-line quantities, and total cups.

Any failed or absent gate is an overall HOLD.
