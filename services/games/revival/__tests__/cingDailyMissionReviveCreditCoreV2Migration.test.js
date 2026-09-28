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
    "db/migrations/20260924_cing_daily_mission_revive_credit_core_v2.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260924200000_cing_daily_mission_revive_credit_core_v2.sql"
  ),
  "utf8"
);

const executable = sql
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n]*/g, "");

test("Daily Mission V2 mirror exact", () => {
  assert.equal(sql, mirror);
});

test("V2 is a new function, not V1 replacement", () => {
  assert.match(
    executable,
    /create function\s+public\.complete_daily_mission_revive_v2/i
  );

  assert.doesNotMatch(
    executable,
    /create or replace function\s+public\.complete_daily_mission_atomic/i
  );
});

test("player lock precedes mission replay fence", () => {
  assert.match(
    executable,
    /from public\.players p[\s\S]*for update[\s\S]*from public\.daily_missions m[\s\S]*for update/i
  );
});

test("completed missions return before reward mutation", () => {
  assert.match(
    executable,
    /if found\s+and v_existing\.completed[\s\S]*return;[\s\S]*insert into\s+public\.daily_missions/i
  );
});

test("reward snapshot explicitly marks Revive Credit", () => {
  assert.match(
    executable,
    /'reward_currency',\s*'revive_credit'/i
  );

  assert.match(
    executable,
    /'revive_credits',\s*v_credits/i
  );

  assert.match(
    executable,
    /plays_awarded\s*=\s*excluded\.plays_awarded/i
  );
});

test("Revive Credit uses private atomic authority", () => {
  assert.match(
    executable,
    /cing_revive_credit_apply_private_v1\s*\(/i
  );

  assert.match(
    executable,
    /'daily_mission_revive_v2',\s*v_mission_id::text/i
  );

  assert.match(
    executable,
    /DAILY_MISSION_REVIVE_GRANT_FAILED/
  );
});

test("loyalty points retain canonical ledger", () => {
  assert.match(
    executable,
    /update public\.players p[\s\S]*total_points\s*=\s*v_points_after/i
  );

  assert.match(
    executable,
    /insert into\s+public\.point_transactions/i
  );

  assert.match(
    executable,
    /mission_id,\s*transaction_type,\s*points,\s*balance_before,\s*balance_after/i
  );
});

test("V2 does not mutate legacy plays or Wallet", () => {
  assert.doesNotMatch(
    executable,
    /\bgame_plays\s*=/i
  );

  assert.doesNotMatch(
    executable,
    /insert into\s+public\.game_play_transactions/i
  );

  assert.doesNotMatch(
    executable,
    /cing_wallet|wallet_balance|ipos/i
  );
});

test("customer roles cannot execute the V2 RPC", () => {
  assert.match(
    executable,
    /revoke all[\s\S]*from public, anon, authenticated, service_role/i
  );

  assert.match(
    executable,
    /grant execute[\s\S]*to service_role/i
  );
});

test("migration has no history projection side effects", () => {
  assert.doesNotMatch(
    executable,
    /insert into\s+public\.analytics_events/i
  );

  assert.doesNotMatch(
    executable,
    /create trigger/i
  );
});
