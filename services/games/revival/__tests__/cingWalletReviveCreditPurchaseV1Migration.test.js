"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");

const sql = fs.readFileSync(
  path.join(
    root,
    "db/migrations/20260925_cing_wallet_revive_credit_purchase_authority_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260925001000_cing_wallet_revive_credit_purchase_authority_v1.sql"
  ),
  "utf8"
);

const executable = sql
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n]*/g, "");

test("migration mirror is exact", () => {
  assert.equal(mirror, sql);
});

test("backend-only RPC has canonical purchase inputs", () => {
  assert.match(
    executable,
    /cing_wallet_purchase_revive_credits_v1\(\s*p_user_id text,\s*p_quantity integer,\s*p_request_id uuid/i
  );

  assert.match(
    executable,
    /security definer/i
  );
});

test("request identity and quantity are required", () => {
  assert.match(
    executable,
    /REVIVE_PURCHASE_USER_REQUIRED/
  );

  assert.match(
    executable,
    /REVIVE_PURCHASE_QUANTITY_INVALID/
  );

  assert.match(
    executable,
    /REVIVE_PURCHASE_REQUEST_ID_REQUIRED/
  );
});

test("Wallet lock precedes replay and current price", () => {
  const lock = executable.indexOf(
    "from public.cing_wallet_accounts a"
  );

  const replay = executable.indexOf(
    "from public.cing_wallet_transactions wt"
  );

  const price = executable.indexOf(
    "select ac.wallet_revive_credit_price"
  );

  assert.ok(lock >= 0);
  assert.ok(replay > lock);
  assert.ok(price > replay);

  assert.match(
    executable,
    /from public\.cing_wallet_accounts a[\s\S]*?for update/i
  );
});

test("replay validates historical financial snapshot", () => {
  assert.match(
    executable,
    /v_wallet\.metadata ->> 'quantity'/
  );

  assert.match(
    executable,
    /v_wallet\.metadata ->> 'unit_price'/
  );

  assert.match(
    executable,
    /v_wallet\.metadata ->> 'total_cost'/
  );

  assert.match(
    executable,
    /v_wallet\.amount <> -v_snapshot_cost/
  );
});

test("replay requires matching Revive Credit ledger", () => {
  assert.match(
    executable,
    /from public\.cing_revive_credit_transactions t/i
  );

  assert.match(
    executable,
    /'wallet_revive_credit_purchase'/
  );

  assert.match(
    executable,
    /REVIVE_PURCHASE_CREDIT_LEDGER_MISSING/
  );

  assert.match(
    executable,
    /REVIVE_PURCHASE_CREDIT_LEDGER_CONFLICT/
  );
});

test("new purchase reads V2 price from PostgreSQL", () => {
  assert.match(
    executable,
    /select ac\.wallet_revive_credit_price[\s\S]*?from public\.app_configs ac/i
  );

  assert.match(
    executable,
    /REVIVE_PURCHASE_PRICE_NOT_CONFIGURED/
  );

  assert.doesNotMatch(
    executable,
    /\bselect ac\.wallet_play_price\b/i
  );
});

test("Wallet debit precedes Revive Credit grant", () => {
  const debit = executable.indexOf(
    "from public.cing_wallet_apply_mutation_private("
  );

  const grant = executable.indexOf(
    "from public.cing_revive_credit_apply_private_v1("
  );

  assert.ok(debit >= 0);
  assert.ok(grant > debit);

  assert.match(
    executable,
    /'payment',\s*-v_cost/i
  );

  assert.match(
    executable,
    /REVIVE_PURCHASE_CREDIT_GRANT_INVALID/
  );
});

test("Wallet and Credit use distinct ledger identities", () => {
  assert.match(
    executable,
    /'revive_credit_purchase',\s*p_request_id::text/i
  );

  assert.match(
    executable,
    /'wallet_revive_credit_purchase',\s*v_wallet\.id::text/i
  );

  assert.match(
    executable,
    /v_credit_result\.transaction_id/
  );
});

test("RPC does not mutate legacy plays or loyalty", () => {
  assert.doesNotMatch(
    executable,
    /\bupdate\s+public\.players\b/i
  );

  assert.doesNotMatch(
    executable,
    /\b(?:insert into|update|delete from)\s+public\.game_play_transactions\b/i
  );

  assert.doesNotMatch(
    executable,
    /\b(?:insert into|update|delete from)\s+public\.points_transactions\b/i
  );
});

test("application users cannot invoke purchase RPC", () => {
  assert.match(
    executable,
    /revoke all\s+on function\s+public\.cing_wallet_purchase_revive_credits_v1\(\s*text,\s*integer,\s*uuid\s*\)\s+from public,\s*anon,\s*authenticated,\s*service_role/i
  );

  assert.match(
    executable,
    /grant execute\s+on function\s+public\.cing_wallet_purchase_revive_credits_v1\(\s*text,\s*integer,\s*uuid\s*\)\s+to service_role/i
  );
});

test("migration does not execute a purchase", () => {
  assert.doesNotMatch(
    executable,
    /\bselect\s+\*\s+from public\.cing_wallet_purchase_revive_credits_v1\s*\(/i
  );

  assert.doesNotMatch(
    executable,
    /\bupdate\s+public\.app_configs\b/i
  );
});
