# CING KDS Pro — Recovery R3 / P1 C04 Clean Rewrite

Status: **SOURCE-ONLY CANDIDATE — NOT AUTHORIZED FOR PRODUCTION EXECUTION**

This candidate replaces the draft C04 inbox migration. It is intentionally a
new timestamped migration and must never be substituted for the older draft.

## Narrow scope

P1 creates only the private, durable storage and two private database function
definitions for normalized FABi C04 signed-delta events. It does not grant
those functions to `service_role` or any client role. P4 remains the only
future phase allowed to consider narrowly reviewed RPC grants.

## Fail-closed entry conditions

- exactly one P0 adoption record must exist;
- its R2 preflight SHA-256 must exactly match the recorded baseline;
- the C04 table, indexes, and function names must all be absent;
- all C04 source scope identifiers, transaction id, semantic flags, and event
  body must match at the database boundary.

## Durable invariants

- one exact fingerprint has one immutable normalized event;
- exact replays increment only observation metadata;
- any same-fingerprint difference returns `conflict` and cannot overwrite the
  stored payload;
- reads require exact company, brand, store, and transaction scope;
- RLS is enabled and table/function access is revoked from `PUBLIC`, `anon`,
  `authenticated`, and `service_role`.

## Explicit exclusions

P1 does not verify payment, declare invoice finality, project cups, run a
worker, mount a webhook, start a scheduler, read environment variables, or
make live FABi/iPOS calls. It does not certify invoice completeness, exact item
identity, or cup quantity; those remain release gates for later reconciliation
and control-proof stages.

Production application, runtime mounting, grants, commits, pushes, and deploys
remain prohibited without separate explicit authorization after review.
