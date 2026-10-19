# CING KDS Pro — 65E-J Production Control-Proof Runbook

Status: **HOLD — source-only preparation**

This runbook is an approval checklist, not an activation command.  Nothing in
this document authorizes a database migration, live FABi request, worker mount,
scheduler start, deploy, commit, or push.

## Non-negotiable release gates

A Production decision is **PASS** only when all three gates have written,
time-bounded evidence for the same controlled window:

| Gate | Required proof | PASS rule |
| --- | --- | --- |
| Realtime performance | C04/C03 request latency, timeout/cancellation count, one-shot duration, recovery duration and throughput | The release owner approves an SLO before the run, and every measured value is within it. No SLO means HOLD, never implicit PASS. |
| Invoice completeness | Source transaction set, durable C04 set, reconciliation queue set and final KDS set | Each comparison has zero missing and zero extra `tran_id`. |
| Line and cup parity | Exact transaction identity, line signatures and quantities, cup totals | Every eligible `paid_final` C03 invoice matches the durable C04 state exactly. Any ambiguity, mismatch or absent final invoice remains `pending_c03` or `review_required`, never `ready`. |

## Preconditions — must be recorded before Production activity

1. The previously exposed Supabase service-role credential has been rotated.
   Update Railway Production and the operator's local secret store. Do not paste
   the replacement value into chat, shell history, logs, or this document.
2. The release owner explicitly authorizes the Production window and one branch
   tuple (`company_uid`, `brand_uid`, `store_uid`). Do not infer a branch.
3. Capture the deployed source revision and the SHA-256 checksum of both copies
   of each KDS migration. The `db/migrations` and `supabase/migrations` copies
   must be byte-identical before either is applied.
4. Confirm the four fenced runtime RPCs and reconciliation-queue authority
   migrations are present in the planned migration order. Confirm their grants,
   RLS posture, and restricted `search_path` as reviewed in 65E.
5. Fill and approve the performance SLOs below. Blank limits are a HOLD:

| Metric | Approved limit | Observed p50 | Observed p95 | Worst value | PASS/HOLD |
| --- | ---: | ---: | ---: | ---: | --- |
| C04 request duration |  |  |  |  |  |
| C03 request duration |  |  |  |  |  |
| One-shot run duration | `< 120 s` is mandatory |  |  |  |  |
| C04 timeout/cancellation rate |  |  | n/a |  |  |
| C03 timeout/cancellation rate |  |  | n/a |  |  |
| Outage-to-recovery duration |  |  |  |  |  |
| Eligible transactions/minute |  |  |  |  |  |

The 120-second lease is a safety boundary, not a performance target. The
measured worst one-shot duration must stay below 120 seconds; renewal is
token-fenced and exists to protect bounded work, not to permit indefinite work.

## Controlled execution order

1. Run the source-only 65E-J preflight. A failure is a HOLD; do not bypass it.
2. With explicit Production authority, apply the reviewed migrations once, in
   the captured order. Record the migration result and checksum evidence.
3. Keep every runtime dormant until the credentials, migration evidence, SLO,
   target branch, observer, and rollback owner are recorded.
4. Enable a single one-shot run for the authorized branch only. Do not introduce
   an interval, cron, or a second worker. Record lease acquire/renew/release and
   checkpoint outcomes without logging tokens or credentials.
5. Inject no synthetic Production invoice. Observe a naturally occurring,
   consented control window; correlate only redacted identifiers in evidence.
6. Prove the recovery path by observing an approved bounded interruption or a
   safely induced timeout in a non-customer-impacting window. The checkpoint
   must not advance before durable queue authority exists. The next attempt must
   recover exactly the same transaction cardinality, with no missing or extra
   transaction.
7. Stop after the approved sample. Evaluate all three release gates together.
   A single failure is HOLD and requires rollback.

## Overnight rule — UTC+7

From 23:00 inclusive to 08:00 exclusive, retain C04 raw durable evidence but
defer C03 reconciliation and KDS readiness. Online orders stay in the cashier
confirmation queue. At or after 08:00, the recovery window starts from the
first durable event and ends at the current retry instant. Only an exact C03
`paid_final` reconciliation authorizes KDS `ready`; passing 08:00 alone does
not do so.

Record one controlled overnight-to-opening example:

| Evidence | Required result |
| --- | --- |
| Order observed 23:00–08:00 UTC+7 | C04 event retained; no C03 call and no KDS `ready` in the closed interval. |
| At/after 08:00 retry | Window begins at first durable event; no clock regression; exact C03 identity and lines are reconciled. |
| Final state | `ready` only for exact paid-final parity; otherwise `pending_c03` or `review_required`. |

## Integrity worksheet

Use one row per run or recovery attempt. Identifiers must be redacted or
hashed in exported evidence.

| Run | Branch | Window start/end | Source count | Durable C04 count | Queue count | Ready count | Missing | Extra | Line mismatches | Cup mismatches | Checkpoint | Decision |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
|  |  |  |  |  |  |  |  |  |  |  |  |  |

The only acceptable values for `Missing`, `Extra`, line mismatches, and cup
mismatches are zero. A pending invoice is not an extra or a missing invoice if
it is durably queued and awaiting C03 `paid_final`; it must remain visible in
the queue count and be resolved later.

## Rollback / HOLD

On any failed gate, lease loss, unexplained timeout pattern, duplicate,
missing/extra transaction, line mismatch, cup mismatch, or closed-hour policy
violation:

1. Stop the newly enabled worker/one-shot launcher; do not delete raw C04
   events, queue entries, checkpoints, or evidence.
2. Keep runtime mounting and scheduling disabled for the branch.
3. Preserve redacted logs, timestamps, migration checksum, and transaction
   cardinality evidence for diagnosis.
4. Mark the result **HOLD**, then investigate from durable evidence. A replay
   must use the existing token-fenced lease and idempotent queue authority.

There is no destructive rollback in this runbook. Recovery is by stopping the
runtime and keeping durable evidence intact.

## Final decision record

| Field | Value |
| --- | --- |
| Production authorization reference |  |
| Credential rotation confirmed (no secret recorded) |  |
| Branch tuple |  |
| Source revision / migration checksums |  |
| Approved SLO reference |  |
| Evidence window (UTC+7) |  |
| Realtime gate | PASS / HOLD |
| Completeness gate | PASS / HOLD |
| Line and cup parity gate | PASS / HOLD |
| Overall | PASS / HOLD |
| Release owner / observer / rollback owner |  |

`Overall = PASS` requires every gate above to be PASS. Otherwise the KDS
remains dormant for that branch.
