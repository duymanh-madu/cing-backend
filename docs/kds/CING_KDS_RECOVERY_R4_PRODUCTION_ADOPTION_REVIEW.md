# CING KDS Recovery R4 — Production Adoption Review

## Status

**SOURCE-ONLY REVIEW. NOT AUTHORIZED FOR PRODUCTION EXECUTION.**

This packet makes the candidate set reviewable. It does not grant permission to
run a migration, issue a grant, access a database, mount a runtime, start a
worker, schedule work, commit, push, or deploy.

**NO SQL IS TO BE EXECUTED from this packet.**

## Candidate order

The only candidate order is **P0 → P1 → P2 → P3 → P4**. A later candidate
must not be considered executable until an authorized change window has
recorded successful evidence for each earlier candidate.

| Phase | Migration | SHA-256 |
| --- | --- | --- |
| P0 | `20261019120000_cing_kds_production_adoption_guard_v1.sql` | `bfdaf7ba776ba7b0371248c49a5ad50f812790592a88e422de66bee3200b55cb` |
| P1 | `20261019130000_cing_kds_fabi_c04_event_inbox_p1_v1.sql` | `30d9f0d64b7aeffb905babb649a7b9ea31522488739a20b0336b16f618013540` |
| P2 | `20261019140000_cing_kds_fabi_runtime_fencing_p2_v1.sql` | `6b840b6693a53862581ce0db3185dd07829dc88d6be5acb8d6a5331103ee9a5a` |
| P3 | `20261019150000_cing_kds_fabi_reconciliation_queue_p3_v1.sql` | `210400deb0c6eab751fbbe5aa316664ff2ede2bf7b24fd2d21bca7d28fad8119` |
| P4 | `20261019160000_cing_kds_restricted_rpc_grants_p4_v1.sql` | `0de1c1c4f2dcd6232901fa67299c3f9b5f2df970616fb6a0c5b95bf35c79bacc` |

P4 is source-only at this stage. Its candidate defines the restricted
service-role RPC surface; it does not confer a currently usable grant.

## Review gates before an execution request

All of the following must be independently evidenced and accepted in the
approved change request. Any missing or ambiguous item is a **HOLD**:

1. An explicit, time-bounded authorization to execute exactly the named phase
   in the stated Production project.
2. **KEY-ROTATION EVIDENCE** verified outside this repository; never paste a
   key or secret into this review packet.
3. **BRANCH APPROVAL** for the exact single branch/store scope.
4. **LIVE SLO EVIDENCE** demonstrating the control-proof thresholds, including
   p95 C03+C04 at or below 10 seconds and no unclassified timeout/cancellation.
5. Recorded result of the existing read-only R2 adoption preflight, with no
   state drift. The preflight itself is not a grant to execute a migration.
6. A rollback/containment owner and an observed post-check for every phase.

## Review-only post-check definitions

If and only if a future change request receives execution approval, reviewers
must require phase-local evidence before advancing:

| After phase | Required evidence before considering the next phase |
| --- | --- |
| P0 | Adoption guard recorded only after the contained baseline/preflight conditions hold. |
| P1 | C04 inbox schema is present and no client/RPC grant was introduced. |
| P2 | Runtime fencing has the exact 120-second lease and UUID capability requirements. |
| P3 | Queue claims are branch+transaction scoped and exactly 120 seconds. |
| P4 | Only the reviewed service-role RPC surface is granted; no table, anon, or authenticated authority appears. |

The runtime remains unmounted throughout this review. Control proof, database
access, live FABi traffic, and scheduling require their own later authorization.
