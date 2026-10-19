# CING KDS Pro — Recovery R3 / P2 Runtime Fencing Clean Rewrite

Status: **SOURCE-ONLY CANDIDATE — NOT AUTHORIZED FOR PRODUCTION EXECUTION**

This is a new P2 candidate, not a port of the old runtime-fencing draft. It
creates private branch lease/checkpoint primitives only.

P2 fails closed unless P0’s exact adoption record and P1’s restricted C04
surface are present. It also refuses pre-existing runtime objects and a missing
`pg_catalog.gen_random_uuid()` prerequisite. It creates no extension.

The lease scope is exactly `company_uid + brand_uid + store_uid`. Lease acquire
and renew accept only the 120-second policy; checkpoint commit and release are
token fenced, and an expired/stale token cannot advance or release a newer
lease. `checkpoint_end_ms` is recovery scheduling metadata only.

RLS is enabled. All direct table and function access is revoked from `PUBLIC`,
`anon`, `authenticated`, and `service_role`. P2 grants nothing; P4 alone may
consider a narrowly reviewed service-role grant in a later source-only phase.

P2 has no scheduler, worker mount, webhook, network call, payment authority,
final-state authority, source-completeness authority, invoice/cup projection,
commit, push, deploy, or Production execution authorization.
