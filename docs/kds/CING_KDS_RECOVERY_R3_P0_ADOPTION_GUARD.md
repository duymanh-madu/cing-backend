# CING KDS Pro — Recovery R3 / P0 Adoption Guard

Status: **SOURCE-ONLY — NOT AUTHORIZED FOR PRODUCTION EXECUTION**

`20261019120000_cing_kds_production_adoption_guard_v1.sql` is the first
candidate in a new Production-ready series. It does exactly one narrow job:
adopt the Recovery R2 contained baseline only when every invariant still holds.

It first fails closed on missing/dirty/uncontained draft objects. Only then it
creates one restricted adoption-record table and one immutable record carrying
the SHA-256 of the R2 adoption preflight SQL.

It does **not**:

- create a FABi/iPOS writer;
- create runtime fencing, reconciliation queue, or C04 inbox;
- grant table or function access to `service_role`;
- mount KDS into server/webhook/worker/scheduler code; or
- certify payment, source completeness, line identity, cup quantity, or KDS
  readiness.

Production application remains prohibited until a separate explicit
authorization after checksum capture and review.
