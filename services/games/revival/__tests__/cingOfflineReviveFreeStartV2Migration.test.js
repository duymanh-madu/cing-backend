"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../..");

const dbPath = path.join(
  ROOT,
  "db/migrations/20260924_cing_offline_revive_free_start_v2.sql"
);

const mirrorPath = path.join(
  ROOT,
  "supabase/migrations/20260924180000_cing_offline_revive_free_start_v2.sql"
);

const sql = fs.readFileSync(dbPath, "utf8");
const mirror = fs.readFileSync(mirrorPath, "utf8");

const executable = sql.replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

test("Free-start V2 migration mirrors match", () => {
  assert.equal(sql, mirror);
});

test("replaces the established start RPC without changing signature", () => {
  assert.match(
    executable,
    /create or replace function\s+public\.cing_offline_revive_start_v1\s*\(\s*p_user_id text,\s*p_request_id uuid,\s*p_game_key text/i
  );

  for (const column of [
    "applied boolean",
    "session_id uuid",
    "game_key text",
    "session_status text",
    "revives_used integer",
    "event_seq integer",
    "expires_at timestamptz",
  ]) {
    assert.ok(executable.includes(column), column);
  }
});

test("Tower and Rush retain separate offline session authority", () => {
  assert.match(executable, /'cing-stack-tower'/);
  assert.match(executable, /'black-pearl-rush'/);

  assert.doesNotMatch(
    executable,
    /'cing-block-puzzle'/
  );

  assert.match(
    executable,
    /public\.cing_offline_revive_sessions/
  );
});

test("start is free and does not mutate balances or play ledger", () => {
  for (const forbidden of [
    /game_play_transactions/i,
    /plays_deducted/i,
    /NO_GAME_PLAYS/i,
    /game_plays/i,
    /cing_revive_credit_balances/i,
    /cing_revive_credit_transactions/i,
    /cing_wallet/i,
  ]) {
    assert.doesNotMatch(executable, forbidden);
  }
});

test("session identity and replay remain database-authoritative", () => {
  assert.match(
    executable,
    /gen_random_uuid\(\)/
  );

  assert.match(
    executable,
    /on conflict \(user_id, request_id\)\s+do nothing/i
  );

  assert.match(
    executable,
    /REVIVAL_START_REFERENCE_CONFLICT/
  );

  assert.match(
    executable,
    /REVIVAL_START_REPLAY_NOT_FOUND/
  );
});

test("start RPC remains executable only by service_role", () => {
  assert.match(
    executable,
    /revoke all[\s\S]*from public, anon, authenticated, service_role;/i
  );

  assert.match(
    executable,
    /grant execute[\s\S]*to service_role;/i
  );

  assert.match(
    executable,
    /commit;/i
  );
});
