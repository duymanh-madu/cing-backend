"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");

const migration = fs.readFileSync(
  path.join(
    root,
    "db/migrations/20260924_cing_revive_credit_legacy_conversion_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260924193000_cing_revive_credit_legacy_conversion_v1.sql"
  ),
  "utf8"
);

const executable = migration
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n]*/g, "");

test("conversion migration mirror is exact", () => {
  assert.equal(mirror, migration);
});

test("conversion is installed but not executed", () => {
  assert.match(
    executable,
    /create function\s+public\.cing_revive_credit_convert_legacy_player_v1/i
  );

  assert.doesNotMatch(
    executable,
    /\bselect\s+(?:\*\s+from\s+)?public\.cing_revive_credit_convert_legacy_player_v1\s*\(/i
  );
});

test("one receipt per player including zero balances", () => {
  assert.match(
    executable,
    /cing_revive_credit_legacy_conversions\s*\(\s*user_id text primary key/i
  );

  assert.match(
    executable,
    /legacy_game_plays = 0\s+and revive_transaction_id is null/i
  );

  assert.match(
    executable,
    /legacy_game_plays > 0\s+and revive_transaction_id is not null/i
  );
});

test("player lock precedes private Revive Credit mutation", () => {
  const lock = executable.indexOf("for update;");
  const mutation = executable.indexOf(
    "from public.cing_revive_credit_apply_private_v1("
  );

  assert.ok(lock >= 0);
  assert.ok(mutation > lock);
});

test("conversion uses stable ledger reference and 1:1 amount", () => {
  assert.match(
    executable,
    /'legacy_game_plays_conversion_v1'/i
  );

  assert.match(
    executable,
    /v_user_id,\s*v_legacy_plays,\s*'Chuyển đổi lượt chơi lịch sử sang Revive Credit'/i
  );

  assert.match(
    executable,
    /'conversion_ratio',\s*'1:1'/i
  );
});

test("conversion cannot reset legacy balance or mutate financial domains", () => {
  assert.doesNotMatch(
    executable,
    /\bupdate\s+public\.players\b/i
  );

  assert.doesNotMatch(
    executable,
    /\b(?:insert into|update|delete from)\s+public\.(?:point_transactions|cing_wallets|wallets|game_play_transactions)\b/i
  );
});

test("no customer or service_role conversion EXECUTE grant", () => {
  assert.match(
    executable,
    /revoke all\s+on function\s+public\.cing_revive_credit_convert_legacy_player_v1\s*\(\s*text\s*\)\s*from public, anon, authenticated, service_role/i
  );

  assert.doesNotMatch(
    executable,
    /grant execute[\s\S]*?cing_revive_credit_convert_legacy_player_v1/i
  );
});
