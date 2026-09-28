"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");

const sql = fs.readFileSync(
  path.join(
    root,
    "db/migrations/20260922_cing_offline_revive_sessions_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260922213000_cing_offline_revive_sessions_v1.sql"
  ),
  "utf8"
);

const executable = sql.replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

test("offline session migration mirror is identical", () => {
  assert.equal(mirror, sql);
});

test("creates independent lifecycle for two games", () => {
  assert.match(
    executable,
    /create table public\.cing_offline_revive_sessions/i
  );

  assert.match(
    executable,
    /'cing-stack-tower',\s*'black-pearl-rush'/i
  );

  assert.doesNotMatch(
    executable,
    /'cing-block-puzzle'/i
  );
});

test("session has unique idempotent start identity", () => {
  assert.match(
    executable,
    /id uuid primary key/i
  );

  assert.match(
    executable,
    /unique \(user_id, request_id\)/i
  );
});

test("revival count is bounded at five", () => {
  assert.match(
    executable,
    /revives_used between 0 and 5/i
  );
});

test("timeout and death have distinct game guards", () => {
  assert.match(
    executable,
    /game_key = 'cing-stack-tower'\s*and pending_reason = 'timeout'/i
  );

  assert.match(
    executable,
    /game_key = 'black-pearl-rush'\s*and pending_reason = 'death'/i
  );
});

test("active, pending and finalized are distinct", () => {
  for (const status of [
    "active",
    "revive_pending",
    "finalized",
  ]) {
    assert.ok(executable.includes(`'${status}'`));
  }

  assert.match(
    executable,
    /pending_at is not null[\s\S]*finalized_at is null/i
  );
});

test("service role reads but cannot mutate sessions", () => {
  assert.match(
    executable,
    /revoke all[\s\S]*cing_offline_revive_sessions[\s\S]*from public, anon, authenticated, service_role/i
  );

  assert.match(
    executable,
    /grant select[\s\S]*cing_offline_revive_sessions[\s\S]*to service_role/i
  );
});

test("migration does not touch old sessions or balances", () => {
  assert.doesNotMatch(
    executable,
    /public\.cing_block_puzzle_sessions/i
  );

  assert.doesNotMatch(
    executable,
    /public\.players/i
  );

  assert.doesNotMatch(
    executable,
    /public\.cing_revive_credit_balances/i
  );

  assert.doesNotMatch(
    executable,
    /public\.cing_wallet_/i
  );
});
