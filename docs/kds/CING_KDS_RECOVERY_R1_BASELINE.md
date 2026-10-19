# CING KDS Pro — Recovery R1 Baseline

Status: **SOURCE-ONLY HOLD**

This record freezes KDS Production activity after three draft migrations were
manually applied during an aborted control-proof preparation. It does not
authorize any migration, runtime mount, scheduler, deployment, FABi request,
or database write.

## Production state recorded on 2026-10-19 (UTC+7)

The following draft migrations were applied manually and must never be replayed:

1. `20261002_cing_kds_foundation_v1.sql`
2. `20261002_cing_kds_event_inbox_v1.sql`
3. `20261002_cing_kds_durable_ingestion_authority_v1.sql`

The remaining original KDS migrations were **not** applied:

1. `20261002_cing_kds_atomic_cup_authority_v1.sql`
2. `20261002_cing_kds_atomic_materialization_v1.sql`
3. `20261015090000_cing_kds_fabi_c04_event_inbox_v1.sql`
4. `20261015100000_cing_kds_fabi_runtime_fencing_v1.sql`
5. `20261015110000_cing_kds_fabi_reconciliation_queue_v1.sql`

Observed containment evidence:

- the seven created KDS tables were empty;
- RLS was enabled on every created table;
- `anon`, `authenticated`, and `service_role` had no direct `SELECT` access;
- `cing_kds_receive_event11_atomic_v1` had no `EXECUTE` access for those roles;
- no non-internal KDS trigger existed;
- no KDS runtime, worker, scheduler, webhook, route, commit, push, or deploy
  was enabled.

This is an incident record, not a claim that KDS is releasable.

## Mandatory release fence

Every original KDS migration in `db/migrations` and
`docs/kds/draft-migrations/r1-original` is **draft-only and prohibited from
Production execution**. They remain byte-identical source references only.
They are intentionally absent from canonical `supabase/migrations` so a
migration runner cannot enumerate or replay them as Production history.
Do not add, commit, deploy, or run them through a migration runner as if they
were Production migration history.

The only approved state after R1 is:

```text
KDS runtime: unmounted
KDS scheduler: absent
KDS webhook writer: absent
KDS Production control-proof: HOLD
```

## Before any future Production KDS work

Create a new, separately reviewed Production-ready migration series. It must:

1. Preflight the already-created seven empty objects and their containment
   posture without assuming a clean database.
2. Fail closed if an object shape, RLS state, privilege, or row count differs
   from the recorded baseline.
3. Adopt existing objects only after the exact preflight passes; never replay
   or silently replace the three draft migrations.
4. Keep all five not-applied draft migrations prohibited until they are
   replaced by reviewed Production-ready equivalents.
5. Receive new, explicit Production authorization only after source review,
   migration checksum capture, rollback/containment design, and all three KDS
   release gates have written evidence.

There is no destructive rollback instruction in R1. Existing empty objects are
preserved until a separate, reviewed remediation decision is explicitly
authorized.
