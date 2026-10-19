# CING KDS Pro — Recovery R3 / P3 Reconciliation Queue Rewrite Contract

Status: **SOURCE-ONLY AUDIT — NO PRODUCTION MIGRATION YET**

P3 must replace, not port, the older C03 reconciliation-queue draft. It keeps
branch-scoped durable retry evidence after a C04 checkpoint advances, but never
confers payment, final-invoice, KDS-ready, completeness, item, or cup authority.

## Findings that block direct reuse

1. The draft uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.
2. It uses `CREATE OR REPLACE FUNCTION` for all three queue functions.
3. It has no single enclosing `BEGIN`/`COMMIT` transaction.
4. It grants the three RPCs to `service_role` in the same migration, although
   restricted grants are deferred to P4.
5. It calls `gen_random_uuid()` without a fail-closed prerequisite assertion.
6. It permits arbitrary 30–900 second claim leases instead of P2's exact
   120-second policy.

## Required P3 replacement properties

- Depends on the exact P0/P1/P2 restricted authority surfaces and fails on
  missing or drifted prerequisite objects/grants.
- Fails if any P3 table, index, function, or grant target already exists.
- Uses one transaction, direct `CREATE` statements, RLS, and revokes direct
  table/function access from `PUBLIC`, `anon`, `authenticated`, and
  `service_role`.
- Requires the UUID generator prerequisite without enabling extensions or
  changing global database state.
- Preserves exact `company_uid + brand_uid + store_uid + tran_id` identity,
  `FOR UPDATE SKIP LOCKED`, token fencing, result-version fencing, and exactly
  120-second retry claims.
- Has no RPC grant, scheduler, worker mount, live HTTP, payment/final-state
  classification, or KDS-ready authority.

## Explicitly deferred

- P4 restricted RPC grants;
- P5 manual control proof; and
- all Production execution, runtime mounting, commit, push, and deploy.
