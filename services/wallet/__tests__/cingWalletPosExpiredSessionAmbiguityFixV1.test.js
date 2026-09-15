const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");

const dbMigration = fs.readFileSync(
  "db/migrations/20260915_cing_wallet_pos_expired_session_ambiguity_fix_v1.sql",
  "utf8"
);

const supabaseMigration = fs.readFileSync(
  "supabase/migrations/20260915073000_cing_wallet_pos_expired_session_ambiguity_fix_v1.sql",
  "utf8"
);

test("forward migration mirrors are byte-identical", () => {
  assert.equal(dbMigration, supabaseMigration);
});

test("repair replaces canonical lifecycle helper only", () => {
  assert.match(
    dbMigration,
    /create or replace function\s+public\.cing_wallet_expire_stale_manual_pos_session_private_v1/i
  );

  assert.doesNotMatch(
    dbMigration,
    /create or replace function\s+public\.cing_wallet_expire_stale_manual_pos_sessions_batch_v1/i
  );
});

test("session payment_intent_id predicate is explicitly qualified", () => {
  assert.match(
    dbMigration,
    /target_session\.payment_intent_id\s*=\s*v_intent\.id/i
  );

  assert.doesNotMatch(
    dbMigration,
    /\band\s+payment_intent_id\s*=\s*v_intent\.id/i
  );
});

test("intent mutation predicates are explicitly qualified", () => {
  assert.match(
    dbMigration,
    /target_intent\.id\s*=\s*v_intent\.id/i
  );

  assert.match(
    dbMigration,
    /target_intent\.status\s*=\s*'pending'/i
  );

  assert.match(
    dbMigration,
    /target_intent\.wallet_transaction_id\s+is\s+null/i
  );
});

test("repair preserves financial-proof fail-closed fence", () => {
  assert.match(
    dbMigration,
    /CING_WALLET_POS_EXPIRE_FINANCIAL_PROOF_PRESENT/
  );

  assert.match(
    dbMigration,
    /v_intent\.customer_user_id\s+is\s+not\s+null/i
  );

  assert.match(
    dbMigration,
    /v_intent\.wallet_transaction_id\s+is\s+not\s+null/i
  );

  assert.match(
    dbMigration,
    /v_intent\.paid_at\s+is\s+not\s+null/i
  );
});

test("repair preserves immutable POS and amount identity fence", () => {
  assert.match(
    dbMigration,
    /v_intent\.pos_parent\s*<>\s*v_session\.pos_parent/i
  );

  assert.match(
    dbMigration,
    /v_intent\.pos_id\s*<>\s*v_session\.pos_id/i
  );

  assert.match(
    dbMigration,
    /v_intent\.bill_reference[\s\S]*is distinct from[\s\S]*v_session\.sale_tran_id/i
  );

  assert.match(
    dbMigration,
    /v_intent\.amount\s*<>\s*v_session\.amount/i
  );
});

test("repair preserves append-only SESSION_EXPIRED audit", () => {
  assert.match(
    dbMigration,
    /SESSION_EXPIRED/
  );

  assert.match(
    dbMigration,
    /intent_expired:[\s\S]*v_intent\.id::text/i
  );

  assert.match(
    dbMigration,
    /on conflict do nothing/i
  );
});

test("repair contains no Wallet or loyalty mutation authority", () => {
  assert.doesNotMatch(
    dbMigration,
    /insert\s+into\s+public\.cing_wallet_transactions/i
  );

  assert.doesNotMatch(
    dbMigration,
    /update\s+public\.cing_wallet_accounts/i
  );

  assert.doesNotMatch(
    dbMigration,
    /updateMemberPoint|addPoints|add_points|syncSingleUserSpending/i
  );
});

test("helper remains service-role only", () => {
  assert.match(
    dbMigration,
    /revoke all on function[\s\S]*from public, anon, authenticated/i
  );

  assert.match(
    dbMigration,
    /grant execute on function[\s\S]*to service_role/i
  );
});
