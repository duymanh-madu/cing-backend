# CING KDS Recovery R3/P5 — Manual Control-Proof Gate

Status: **SOURCE-ONLY HOLD — NOT AUTHORIZED FOR PRODUCTION EXECUTION**

P5 completes the source recovery series but does not run a control proof. The
existing launcher stays unmounted and manual. This gate verifies only the
source candidates P0–P4 and records why Production remains HOLD.

Production proof can be considered only after all of the following are
independently reviewed and explicitly authorized:

- a fresh read-only Production preflight proves the contained baseline and the
  reviewed P0→P4 migration order;
- the previously exposed service-role key has been rotated outside chat and
  all obsolete credentials have been disabled;
- one exact approved branch is supplied; no wildcard/multi-branch operation;
- manual one-shot deadline is at most 110 seconds under the 120-second lease;
- measured C03 and C04 p95 are at most 10 seconds, with zero unclassified
  timeout/cancellation; and
- invoice existence, item identity, line quantity, and cup quantity all pass
  against authoritative reconciliation, with any uncertainty classified HOLD.

P5 authorizes no SQL, RPC, environment read, live FABi/iPOS request, worker,
scheduler, server mount, commit, push, or deploy.
