# CING KDS Recovery R3/P3 — Clean Reconciliation Queue

Status: **SOURCE-ONLY CANDIDATE — NOT AUTHORIZED FOR PRODUCTION EXECUTION**

P3 is a new atomic queue migration. It requires the contained P0 baseline plus
restricted P1/P2 surfaces; fails on pre-existing queue objects or a missing
UUID generator; and creates no extension or grant.

The durable identity is exactly company, brand, store, and transaction. Exact
same-state replays preserve result version, retry schedule, and active claim.
A changed result increments version and invalidates old claims. Due work uses
`FOR UPDATE SKIP LOCKED`; claim and resolve require exactly 120 seconds,
unexpired claim token, and expected result version.

The queue is not payment, final invoice, source completeness, KDS-ready, item,
or cup authority. It has no worker mount, scheduler, network call, RPC grant,
commit, push, deploy, or Production execution authorization.
