# CING KDS Recovery R3/P4 — Restricted RPC Grants

Status: **SOURCE-ONLY CANDIDATE — NOT AUTHORIZED FOR PRODUCTION EXECUTION**

P4 is the only candidate that would grant runtime database capability. It grants
only the nine exact C04, P2 lease, and P3 queue functions to `service_role`.
It never grants any table privilege, client-role execution, scheduler, worker,
network, payment/finality/KDS-ready authority, or deployment permission.

Before any grant it verifies the three tables exist, have RLS, and deny direct
select to `anon`, `authenticated`, and `service_role`; it also verifies the
exact nine-function surface. Application remains prohibited until a separate
Production authorization after key rotation and final proof review.
