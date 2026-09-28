const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");

const sql = fs.readFileSync(
  path.join(
    root,
    "db/migrations/20260922_cing_revive_credit_atomic_mutation_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260922200000_cing_revive_credit_atomic_mutation_v1.sql"
  ),
  "utf8"
);

const executable = sql.replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

test("atomic mutation mirror is identical", () => {
  assert.equal(mirror, sql);
});

test("private function uses PostgreSQL transaction authority", () => {
  assert.match(
    sql,
    /create function public\.cing_revive_credit_apply_private_v1/i
  );

  assert.match(
    sql,
    /security definer/i
  );

  assert.match(
    sql,
    /for update/i
  );
});

test("first grant and concurrent retry have durable fences", () => {
  assert.match(
    sql,
    /on conflict \(user_id\) do nothing/i
  );

  const replayChecks = sql.match(
    /REVIVE_REFERENCE_CONFLICT/g
  );

  assert.equal(replayChecks?.length, 2);
});

test("failed and overflow balance mutations are rejected", () => {
  assert.match(
    sql,
    /INSUFFICIENT_REVIVE_CREDITS/
  );

  assert.match(
    sql,
    /REVIVE_BALANCE_OVERFLOW/
  );

  assert.match(
    sql,
    /v_balance_before::bigint\s*\+\s*p_amount::bigint/i
  );
});

test("balance and ledger are updated in one function", () => {
  assert.match(
    executable,
    /update public\.cing_revive_credit_balances/i
  );

  assert.match(
    executable,
    /insert into public\.cing_revive_credit_transactions/i
  );

  assert.match(
    executable,
    /returning id\s+into v_transaction_id/i
  );
});

test("generic mutation is not directly granted to service role", () => {
  assert.match(
    executable,
    /revoke all\s+on function public\.cing_revive_credit_apply_private_v1[\s\S]*from public, anon, authenticated, service_role/i
  );

  assert.doesNotMatch(
    executable,
    /grant execute[\s\S]*cing_revive_credit_apply_private_v1/i
  );
});

test("legacy, Wallet and loyalty balances remain untouched", () => {
  assert.doesNotMatch(
    executable,
    /\bupdate public\.players\b/i
  );

  assert.doesNotMatch(
    executable,
    /\bupdate public\.cing_wallet_balances\b/i
  );

  assert.doesNotMatch(
    executable,
    /\bupdate public\.point_transactions\b/i
  );

  assert.doesNotMatch(
    executable,
    /\bgame_plays\b/i
  );

  assert.doesNotMatch(
    executable,
    /\bcing_wallet_apply_mutation_private\b/i
  );
});
