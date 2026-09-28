"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");

const db = fs.readFileSync(
  path.join(root,
    "db/migrations/20260923_cing_offline_revive_reward_delivery_rpc_v1.sql"),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(root,
    "supabase/migrations/20260923131000_cing_offline_revive_reward_delivery_rpc_v1.sql"),
  "utf8"
);

test("SQL mirrors match", () => {
  assert.equal(db, mirror);
});

test("one PostgreSQL migration transaction", () => {
  assert.match(db, /^begin;/i);
  assert.match(db, /commit;\s*$/i);
});

test("claim skips locked jobs", () => {
  assert.match(db, /for update skip locked/i);
});

test("claim also recovers expired leases", () => {
  assert.match(db, /o\.reward_status = 'pending'/);
  assert.match(db, /o\.reward_status = 'processing'/);
  assert.match(db, /o\.reward_locked_until <= v_now/);
});

test("claim issues a fresh worker token", () => {
  assert.match(
    db,
    /reward_worker_token = gen_random_uuid\(\)/
  );
});

test("renew cannot restore expired lease", () => {
  assert.match(
    db,
    /o\.reward_locked_until >\s*clock_timestamp\(\)/
  );
});

test("ACK requires owned unexpired lease", () => {
  const start = db.indexOf(
    "public.cing_offline_revive_reward_ack_v1("
  );
  const end = db.indexOf(
    "public.cing_offline_revive_reward_fail_v1(",
    start
  );
  const ack = db.slice(start, end);

  assert.match(
    ack,
    /o\.reward_worker_token = p_worker_token/
  );
  assert.match(
    ack,
    /o\.reward_locked_until > clock_timestamp\(\)/
  );
});

test("completed ACK requires committed credit and notification intent", () => {
  assert.match(
    db,
    /v_row\.reward_applied is distinct from true/
  );
  assert.match(
    db,
    /v_row\.reward_notification_status is distinct from 'pending'/
  );
});

test("applied credit cannot be skipped", () => {
  assert.match(
    db,
    /p_outcome = 'skipped'[\s\S]*?v_row\.reward_applied is true/
  );
});

test("committed credit always remains retryable", () => {
  assert.match(
    db,
    /when o\.reward_applied is true\s+then 'pending'/
  );
});

test("terminal failure only applies before credit", () => {
  assert.match(
    db,
    /when o\.reward_attempt_count >= 6\s+then 'failed'/
  );
});

test("reward ACK does not mark notification delivered", () => {
  assert.doesNotMatch(
    db,
    /reward_notification_status\s*=\s*'delivered'/
  );
});

test("no financial balance or ledger writes", () => {
  assert.doesNotMatch(
    db,
    /update\s+public\.players/i
  );
  assert.doesNotMatch(
    db,
    /insert\s+into\s+public\.point_transactions/i
  );
});

test("all four RPCs are service-role only", () => {
  for (const name of [
    "claim",
    "renew",
    "ack",
    "fail",
  ]) {
    assert.match(
      db,
      new RegExp(
        "grant execute on function\\s+" +
        "public\\.cing_offline_revive_reward_" +
        name +
        "_v1\\([\\s\\S]*?to service_role;",
        "i"
      )
    );
  }
});
