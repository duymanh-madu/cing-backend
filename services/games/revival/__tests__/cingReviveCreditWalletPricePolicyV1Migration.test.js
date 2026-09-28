"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");

const sql = fs.readFileSync(
  path.join(
    root,
    "db/migrations/20260924_cing_revive_credit_wallet_price_policy_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260924234000_cing_revive_credit_wallet_price_policy_v1.sql"
  ),
  "utf8"
);

const executable = sql
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n]*/g, "");

test("Supabase mirror is exact", () => {
  assert.equal(mirror, sql);
});

test("price belongs to app_configs", () => {
  assert.match(
    executable,
    /alter table public\.app_configs\s+add column if not exists\s+wallet_revive_credit_price bigint/i
  );
});

test("NULL disables purchase and configured price is positive", () => {
  assert.match(
    executable,
    /wallet_revive_credit_price is null\s+or wallet_revive_credit_price > 0/i
  );
});

test("price constraint is guarded against repeated creation", () => {
  assert.match(
    executable,
    /if not exists\s*\([\s\S]*pg_constraint[\s\S]*app_configs_wallet_revive_credit_price_positive_ck/i
  );
});

test("migration does not activate a price", () => {
  assert.doesNotMatch(
    executable,
    /\bupdate\s+public\.app_configs\b/i
  );

  assert.doesNotMatch(
    executable,
    /\bwallet_revive_credit_price\s+bigint\s+default\b/i
  );
});

test("migration does not mutate financial or revive ledgers", () => {
  assert.doesNotMatch(
    executable,
    /\b(?:insert into|update|delete from)\s+public\.(?:cing_wallet_transactions|cing_wallet_balances|cing_revive_credit_transactions|cing_revive_credit_balances|players)\b/i
  );
});

test("legacy wallet_play_price remains untouched", () => {
  assert.doesNotMatch(
    executable,
    /\bwallet_play_price\b/i
  );
});
