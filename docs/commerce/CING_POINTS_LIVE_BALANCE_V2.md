# Points checkout and live balance, 23 October 2026

Points-only orders retain PostgreSQL `points/internal` settlement, amount zero,
full frozen coverage and matching reservation. The iPOS projection defaults to
`MOMO_OD_ONLINE`, `Amount: 0`, `Payment_Info: LOYALTY_POINTS`. Configured point
methods are retained; only an explicit unsupported/invalid tender response may
switch to the zero-cash mapping with the same order identity. Network timeouts
and other ambiguous errors stay on the existing durable recovery path.

`GET /api/membership/balance/current` is authenticated, owner-bound, uncached and
read-only. Cached membership tier/profile metadata now overlays the current
local point balance. The new SQL migration extends the existing guarded CRM
snapshot function with claimed ordinary and campaign reward outbox fences.
Unclaimed rewards and historical null-status records do not freeze CRM sync.
No existing customer balance is changed by deployment. A previously overwritten
balance is not automatically credited again; existing iPOS delivery/reconciliation
remains the authority, avoiding duplicate rewards.

Deploy the paired 20261023 migration before backend/frontend. Function ownership
and existing execution grants remain unchanged by CREATE OR REPLACE.

Validation: zero-cash payload / fallback / ambiguous failure runtime tests;
authenticated owner isolation and cached-balance tests; local PostgreSQL rollback
proof covering pending/processing/failed and campaign rewards plus all four
existing debit fences. No production test orders or point mutations were run.
The broader source-contract suite has an existing stale expectation for
`runGamePlaysEffectBestEffort` (current main uses Revive Credit); this change does
not modify that settlement processor.
