"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root =
  path.resolve(__dirname, "../../../..");

const sql = fs.readFileSync(
  path.join(
    root,
    "db/migrations/20260924_cing_daily_mission_revive_history_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260924201000_cing_daily_mission_revive_history_v1.sql"
  ),
  "utf8"
);

const executable = sql
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n]*/g, "");

test("history migration mirror identical", () => {
  assert.equal(sql, mirror);
});

test("projection uses canonical Revive Credit ledger", () => {
  assert.match(
    executable,
    /after insert[\s\S]*on public\.cing_revive_credit_transactions/i
  );

  assert.match(
    executable,
    /from\s+public\.cing_revive_credit_transactions rt/i
  );
});

test("projection uses distinct Revive Credit event", () => {
  assert.match(
    executable,
    /'revive_credits_added'/
  );

  assert.match(
    executable,
    /'daily_mission_revive_v2'/
  );

  assert.match(
    executable,
    /'reward_currency',\s*'revive_credit'/
  );
});

test("history has durable unique mission fence", () => {
  assert.match(
    executable,
    /create unique index[\s\S]*analytics_events_daily_mission_revive_v2_uq/i
  );

  assert.match(
    executable,
    /on conflict do nothing/i
  );

  assert.match(
    executable,
    /DAILY_MISSION_REVIVE_HISTORY_POSTCONDITION_FAILED/
  );
});

test("projection does not mutate game or financial balances", () => {
  assert.doesNotMatch(
    executable,
    /\bupdate\s+public\.players\b/i
  );

  assert.doesNotMatch(
    executable,
    /\bupdate\s+public\.cing_revive_credit_balances\b/i
  );

  assert.doesNotMatch(
    executable,
    /\binsert into\s+public\.cing_revive_credit_transactions\b/i
  );

  assert.doesNotMatch(
    executable,
    /\binsert into\s+public\.(?:game_play_transactions|point_transactions)\b/i
  );

  assert.doesNotMatch(
    executable,
    /\bcomplete_daily_mission_atomic\s*\(/i
  );
});

test("projection retains legacy event identities", () => {
  assert.doesNotMatch(
    executable,
    /drop trigger[\s\S]*trg_daily_mission_game_play_history_v1/i
  );

  assert.doesNotMatch(
    executable,
    /create or replace function\s+public\.project_daily_mission_point_history_v1/i
  );
});

test("trigger function execute is not exposed to clients", () => {
  assert.match(
    executable,
    /revoke all[\s\S]*from public, anon, authenticated, service_role/i
  );
});
