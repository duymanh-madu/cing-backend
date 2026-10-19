# CING KDS Recovery R7 — Canonical Source Reconciliation

## Boundary

This batch changes local source files only. It does not connect to Supabase,
run SQL, change Production schema/history, repair migrations, push, deploy, or
activate KDS.

## Local canonical migration changes

1. The 22 byte-verified remote-history Wallet/iPOS/device migration sources
   are restored to `supabase/migrations` from the isolated R6 capture.
2. The eight KDS draft sources are moved from canonical
   `supabase/migrations` to `docs/kds/draft-migrations/r1-original`.
   Their `db/migrations` copies remain unchanged. The R1 verifier compares the
   database mirror against this archive, preserving every byte and checksum.
3. This makes the KDS draft files unavailable for migration-runner enumeration.

## Explicit HOLD

- `20261008093000_cing_plaza_chess_authority_v3.sql`
- `20261008110000_cing_chess_result_authority_v5.sql`

The two Chess migrations remain untouched in canonical source. R7 makes no
claim that they are applied, unapplied, safe, or safe to record.

## After R7

P0-P4 remain schema-confirmed but history-missing. Recording any history still
requires a separately reviewed ledger and explicit remote-mutation approval.
