"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");

const sql = fs.readFileSync(
  path.join(
    root,
    "db/migrations/20260922_cing_offline_revive_start_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260922223000_cing_offline_revive_start_v1.sql"
  ),
  "utf8"
);

const source = sql.replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

test("start RPC migration mirror is identical", () => {
  assert.equal(sql, mirror);
});

test("start RPC is a security-definer function", () => {
  assert.match(
    source,
    /create function public\.cing_offline_revive_start_v1/i
  );

  assert.match(source, /security definer/i);
  assert.match(source, /set search_path = public/i);
});

test("only the two generic offline games can start", () => {
  assert.match(source, /'cing-stack-tower'/);
  assert.match(source, /'black-pearl-rush'/);

  assert.doesNotMatch(
    source,
    /'cing-block-puzzle'/
  );
});

test("session identity and expiry are database-owned", () => {
  assert.match(source, /gen_random_uuid\(\)/i);

  assert.match(
    source,
    /now\(\) \+ interval '4 hours'/i
  );
});

test("same request is durable and replay-safe", () => {
  assert.match(
    source,
    /on conflict \(user_id, request_id\)\s*do nothing/i
  );

  assert.match(
    source,
    /REVIVAL_START_REFERENCE_CONFLICT/
  );

  assert.match(
    source,
    /select\s+false,\s*v_existing\.id/i
  );
});

test("start does not debit any resource", () => {
  assert.doesNotMatch(
    source,
    /cing_revive_credit_apply_private_v1/i
  );

  assert.doesNotMatch(
    source,
    /game_plays/i
  );

  assert.doesNotMatch(
    source,
    /public\.cing_wallet_/i
  );
});

test("only service_role gets RPC execution", () => {
  assert.match(
    source,
    /revoke all[\s\S]*from public, anon, authenticated, service_role/i
  );

  assert.match(
    source,
    /grant execute[\s\S]*to service_role/i
  );
});
