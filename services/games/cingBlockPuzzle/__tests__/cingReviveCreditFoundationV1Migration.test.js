const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/*
 * This test is inside:
 *
 * services/games/cingBlockPuzzle/__tests__
 *
 * Four parent levels lead to backend root.
 */

const root = path.resolve(__dirname, "../../../..");

const migrationPath = path.join(
  root,
  "db/migrations/20260922_cing_revive_credit_foundation_v1.sql"
);

const mirrorPath = path.join(
  root,
  "supabase/migrations/20260922193000_cing_revive_credit_foundation_v1.sql"
);

const sql = fs.readFileSync(migrationPath, "utf8");
const mirror = fs.readFileSync(mirrorPath, "utf8");

const executable = sql.replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

test("revival migration mirrors are identical", () => {
  assert.equal(mirror, sql);
});

test("foundation creates separate balance and ledger domains", () => {
  assert.match(
    sql,
    /create table public\.cing_revive_credit_balances/i
  );

  assert.match(
    sql,
    /create table public\.cing_revive_credit_transactions/i
  );

  assert.match(
    sql,
    /balance_before integer[\s\S]*balance_after integer/i
  );
});

test("ledger enforces nonnegative and mathematical balances", () => {
  assert.match(
    sql,
    /check \(balance >= 0\)/i
  );

  assert.match(
    sql,
    /check \(balance_before >= 0\)/i
  );

  assert.match(
    sql,
    /check \(balance_after >= 0\)/i
  );

  assert.match(
    sql,
    /balance_after\s*=\s*balance_before \+ amount/i
  );
});

test("business references have durable uniqueness", () => {
  assert.match(
    sql,
    /create unique index[\s\S]*cing_revive_credit_tx_reference_uq/i
  );

  assert.match(
    sql,
    /user_id,\s*reference_type,\s*reference_id/i
  );
});

test("balance and ledger deny direct service role mutation", () => {
  assert.match(
    sql,
    /revoke all[\s\S]*cing_revive_credit_balances[\s\S]*from public, anon, authenticated, service_role/i
  );

  assert.match(
    sql,
    /revoke all[\s\S]*cing_revive_credit_transactions[\s\S]*from public, anon, authenticated, service_role/i
  );

  assert.match(
    sql,
    /grant select[\s\S]*cing_revive_credit_balances[\s\S]*to service_role/i
  );

  assert.match(
    sql,
    /grant select[\s\S]*cing_revive_credit_transactions[\s\S]*to service_role/i
  );
});

test("foundation does not modify legacy or financial balances", () => {
  assert.doesNotMatch(
    executable,
    /\b(?:update|delete from|truncate|drop table)\s+public\.players\b/i
  );

  assert.doesNotMatch(
    executable,
    /\balter table\s+public\.players\b/i
  );

  assert.doesNotMatch(
    executable,
    /\bpublic\.cing_wallet_apply_mutation_private\s*\(/i
  );

  assert.doesNotMatch(
    executable,
    /\bpublic\.point_transactions\b/i
  );
});

test("foundation contains no balance-conversion operation", () => {
  assert.doesNotMatch(
    executable,
    /\bgame_plays\b/i
  );

  assert.doesNotMatch(
    executable,
    /\binsert into\s+public\.cing_revive_credit_balances\b/i
  );

  assert.doesNotMatch(
    executable,
    /\binsert into\s+public\.cing_revive_credit_transactions\b/i
  );
});
