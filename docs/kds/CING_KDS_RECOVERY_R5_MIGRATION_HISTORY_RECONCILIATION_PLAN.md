# CING KDS Recovery R5 — Migration History Reconciliation Plan

## Status

**SOURCE-ONLY. NO REPAIR AUTHORIZATION. DO NOT RUN SUPABASE DB PUSH.**

This plan records the observed migration-history drift after P0 through P4
were intentionally applied through the Production SQL Editor and post-checked.
It does not run the Supabase CLI, change local files, change remote history,
change the Production schema, grant authority, mount a runtime, or start work.

## Observed audit state

The read-only `supabase migration list --linked` audit observed four categories.

| Category | Observed versions | Decision in this plan |
| --- | --- | --- |
| P0-P4 schema-confirmed but remote-history-missing | `20261019120000`, `20261019130000`, `20261019140000`, `20261019150000`, `20261019160000` | Eligible for a later, separately authorized history-recording decision only after the full ledger is reconciled. |
| Duplicate local version | five local files beginning `20261002_` | Prohibited from any history recording. The CLI reports each as the same version `20261002`; filenames require source provenance and a non-destructive renaming/recovery design first. |
| KDS draft-only local candidates | `20261015090000`, `20261015100000`, `20261015110000` | Prohibited from history recording. These were superseded by the P1/P2/P3 clean rewrite and must not be represented as applied. |
| REMOTE-ONLY history | `20260913173000`, `20260913184500`, `20260914014500`, `20260914023000`, `20260914033000`, `20260914041000`, `20260914045500`, `20260914053000`, `20260914060000`, `20260914070000`, `20260914124000`, `20260914210000`, `20260914223000`, `20260914233000`, `20260915073000`, `20260915090000`, `20260915123000`, `20260915143000`, `20260915153000`, `20260915163000`, `20260916160000`, `20260918131500` | No remote history entry may be removed. Recover source provenance into an isolated review workspace before any reconciliation decision. |
| Other local-only versions | `20261008093000`, `20261008110000` | Unverified. Do not record, revert, rename, or execute until their owning product migration provenance is reviewed. |

## P0-P4 integrity evidence

P0 → P1 → P2 → P3 → P4 are the only KDS migrations confirmed by Production
post-check in this recovery series. Their source mirrors are byte-identical:

| Phase | Version | SHA-256 |
| --- | --- | --- |
| P0 | `20261019120000` | `bfdaf7ba776ba7b0371248c49a5ad50f812790592a88e422de66bee3200b55cb` |
| P1 | `20261019130000` | `30d9f0d64b7aeffb905babb649a7b9ea31522488739a20b0336b16f618013540` |
| P2 | `20261019140000` | `6b840b6693a53862581ce0db3185dd07829dc88d6be5acb8d6a5331103ee9a5a` |
| P3 | `20261019150000` | `210400deb0c6eab751fbbe5aa316664ff2ede2bf7b24fd2d21bca7d28fad8119` |
| P4 | `20261019160000` | `0de1c1c4f2dcd6232901fa67299c3f9b5f2df970616fb6a0c5b95bf35c79bacc` |

## Required reconciliation order

1. Preserve the audit output and freeze every automatic migration/deploy path.
2. In an isolated source-review workspace, recover authoritative source
   provenance for every REMOTE-ONLY version. This must not alter Production.
3. Resolve the duplicate `20261002` local filenames in a source design that
   preserves their contents and never changes remote schema implicitly.
4. Classify each other local-only version with its owning product team:
   applied historical migration, unapplied draft, or superseded candidate.
5. Re-run a read-only history audit and obtain a written, version-by-version
   ledger. A missing value, duplicate, or ambiguous ownership is a HOLD.
6. Only after the ledger is complete, prepare a minimal history-recording
   proposal. The proposal must list exact versions, expected pre/post history,
   rollback owner, and an independent authorization. It must not modify
   schema, execute migration SQL, or include draft-only versions.
7. P0-P4 may be considered only as an explicit subset of that approved ledger;
   their presence in the schema alone is not approval to record history.

## Prohibitions

- Do not run `db push`, database pull, history repair, remote revert, or a
  migration command based on the current divergent list.
- Do not mark any `20261002` entry, any `20261015090000`-series draft, or any
  REMOTE-ONLY entry as applied/reverted.
- Do not mount the KDS runtime, worker, scheduler, webhook, or live FABi flow
  while migration history is unresolved.
