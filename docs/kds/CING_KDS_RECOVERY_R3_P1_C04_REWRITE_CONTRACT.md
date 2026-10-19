# CING KDS Pro — Recovery R3 / P1 C04 Rewrite Contract

Status: **SOURCE-ONLY REWRITE CONTRACT — NO PRODUCTION MIGRATION YET**

P1 must replace, not port, the draft C04 inbox migration. The draft remains a
reference for domain intent only and is prohibited from Production execution.

## Draft findings that block direct reuse

1. It uses `CREATE ... IF NOT EXISTS`, which can hide unexpected pre-existing
   objects instead of failing closed.
2. It uses `CREATE OR REPLACE FUNCTION`, which can silently replace a function
   that was not reviewed in the current release.
3. It contains input-validation and conflict-handling behavior intertwined with
   DDL, so the replacement needs independent behavior tests rather than a
   textual port of the function body.
4. It grants both C04 RPCs to `service_role` inside the same draft migration.
   Recovery R2 explicitly defers all restricted RPC grants to P4.

## Required P1 replacement properties

- Depends on a successful P0 adoption record with the exact R2 preflight hash.
- Fails if the P0 record is absent, duplicated, or altered.
- Fails if any C04 table, index, function, or grant target already exists.
- Creates only raw normalized C04 durable storage, with no payment, final-state,
  KDS-ready, scheduler, webhook, or public/client authority.
- Enables RLS and revokes all table access from `PUBLIC`, `anon`,
  `authenticated`, and `service_role`.
- Creates private RPC definitions but grants execute to no role in P1.
- Uses exact event fingerprint idempotency and branch+transaction scoped reads.
- Is paired with table/function behavior tests, SQL static checks, byte-identical
  migration mirrors, and a fresh source-only gate before any Production review.

## Explicitly deferred

- P2: branch lease/checkpoint authority;
- P3: durable C03 reconciliation queue;
- P4: restricted service-role RPC grants;
- P5: manual one-shot control proof.

No P1 SQL will be marked Production-ready until every requirement above has a
test or a fail-closed SQL assertion.
