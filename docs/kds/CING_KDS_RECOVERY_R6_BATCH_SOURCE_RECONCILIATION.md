# CING KDS Recovery R6 — Batch Source Reconciliation

## Authorization boundary

This package creates two isolated local Git worktrees and fetches remote
migration source into the remote-history worktree. It is an evidence capture
only. It must not modify the Production schema or remote migration history.

It must never run database push/pull, migration repair, SQL execution, runtime
mounting, worker/scheduler activation, live FABi, commit, push, or deploy.

## Workspace layout

The batch creates a unique directory under the current user's home directory:

- `local-source`: a detached copy of the reviewed source plus the current
  `supabase/migrations` inventory, including untracked candidate files.
- `remote-history`: a detached copy used only for `supabase migration fetch
  --linked`, which captures remote migration source locally.
- `CING_KDS_R6_MIGRATION_LEDGER.json` and `.md`: deterministic comparison
  output.

The current worktree is read but not changed. The remote database is read but
not changed.

## Interpretation

The ledger does not decide that a version is historical, draft, safe to record,
or safe to revert. It only identifies shared, local-only, remote-only, and
duplicate local versions.

P0 through P4 are expected to be local-only before a separately authorized
history-recording decision, because they were intentionally executed once in
the Production SQL Editor and confirmed by post-check.

Any duplicate local version, especially `20261002`, remains a hard HOLD.
Every remote-only version requires provenance review before any local source
recovery or migration-history decision.
