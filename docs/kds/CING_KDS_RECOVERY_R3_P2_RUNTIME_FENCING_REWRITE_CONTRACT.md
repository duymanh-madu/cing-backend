# CING KDS Pro — Recovery R3 / P2 Runtime Fencing Rewrite Contract

Status: **SOURCE-ONLY AUDIT — NO PRODUCTION MIGRATION YET**

P2 must replace, not port, the older runtime-fencing draft. Runtime fencing is
scheduling/recovery metadata only; it is never payment, invoice-finality,
source-completeness, item-identity, or cup-quantity authority.

## Findings that block direct reuse

1. The draft uses `CREATE TABLE IF NOT EXISTS`, which can hide an unexpected
   pre-existing runtime row authority.
2. It uses `CREATE OR REPLACE FUNCTION` for all four fenced functions.
3. It has no single enclosing `BEGIN`/`COMMIT` transaction, so an interrupted
   application could leave a partial runtime authority surface.
4. It grants all four RPCs to `service_role` in the same migration; Recovery R2
   reserves any restricted RPC grant for P4 after all authority reviews.
5. It calls `gen_random_uuid()` without a fail-closed prerequisite assertion.

## Required P2 replacement properties

- Depends on the P0 baseline and on the exact, unaltered P1 C04 authority
  surface; fails when either prerequisite is missing or drifted.
- Fails if any P2 table, function, index, or unexpected grant target already
  exists.
- Uses one transaction, direct `CREATE` statements, no replacement semantics,
  RLS, and revokes direct table/function access from `PUBLIC`, `anon`,
  `authenticated`, and `service_role`.
- Validates the UUID generator prerequisite without enabling extensions or
  altering global database state.
- Preserves strict per-branch token fencing: acquire, renew, checkpoint commit,
  and release must lock the exact branch row; stale or expired tokens cannot
  advance a checkpoint or release a newer lease.
- Has no scheduler, mount, network, payment, final-state, source-completeness,
  invoice/item/cup projection, or RPC grant.

## Explicitly deferred

- P3 durable C03 reconciliation queue;
- P4 restricted service-role RPC grants, only after review;
- P5 manual one-shot control proof; and
- any runtime mount, worker start, production SQL, commit, push, or deploy.
