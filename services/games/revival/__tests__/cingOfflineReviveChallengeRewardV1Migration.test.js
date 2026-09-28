"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");

const db = fs.readFileSync(
  path.join(root, "db/migrations/20260923_cing_offline_revive_challenge_reward_v1.sql"),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(root, "supabase/migrations/20260923125000_cing_offline_revive_challenge_reward_v1.sql"),
  "utf8"
);

test("Reward SQL mirrors identical", () => {
  assert.equal(db, mirror);
});

test("transaction boundary", () => {
  assert.match(db, /^begin;/i);
  assert.match(db, /commit;\s*$/i);
});

test("backend service-role only", () => {
  assert.match(db, /security definer/i);
  assert.match(db, /grant execute[\s\S]*to service_role;/i);
  assert.match(db, /from public, anon, authenticated, service_role;/i);
});

test("session lock precedes config and challenge locks", () => {
  const session = db.indexOf("from public.cing_offline_revive_sessions s");
  const config = db.indexOf("from public.app_configs c");
  const challenge = db.indexOf("from public.daily_challenges c");

  assert.ok(session >= 0 && config > session && challenge > config);
});

test("reward requires Finalize and bound snapshot", () => {
  assert.match(db, /v_session\.status <> 'finalized'/i);
  assert.match(db, /sn\.snapshot_id\s*=\s*v_session\.challenge_snapshot_id/i);
  assert.match(db, /v_snapshot\.enabled is distinct from true/i);
});

test("snapshot uses finalized Vietnam date", () => {
  assert.match(
    db,
    /v_session\.finalized_at\s+at time zone 'Asia\/Ho_Chi_Minh'/i
  );
});

test("score belongs to finalized session", () => {
  assert.match(db, /g\.offline_revive_session_id\s*=\s*v_session\.id/i);
  assert.match(db, /v_score\.score is distinct from\s*v_session\.final_score/i);
});

test("progress comes from persisted score or best combo", () => {
  assert.match(db, /v_session\.final_best_combo/i);
  assert.match(db, /v_score\.score/i);
  assert.match(db, /v_progress < v_snapshot\.target_value/i);
});

test("canonical challenge owns single winner", () => {
  assert.match(
    db,
    /from public\.daily_challenges c[\s\S]*?for update;/i
  );
  assert.match(db, /if coalesce\(v_challenge\.completed, false\) then/i);
});

test("reward amount belongs to bound snapshot", () => {
  assert.match(db, /v_reward := v_snapshot\.reward_points;/i);
});

test("balance ledger and iPOS intent share transaction", () => {
  assert.match(db, /update public\.players/i);
  assert.match(db, /update public\.daily_challenges/i);
  assert.match(db, /ipos_sync_status = 'pending'/i);
  assert.match(db, /insert into public\.point_transactions/i);
  assert.match(db, /'challenge_snapshot_id', v_snapshot\.snapshot_id/i);
});

test("no SQL network notification or iPOS call", () => {
  assert.doesNotMatch(db, /http_post|net\.http_post/i);
});

test("concurrent claimants share canonical row lock", () => {
  const lock = db.indexOf(
    "from public.daily_challenges c"
  );
  const completed = db.indexOf(
    "if coalesce(v_challenge.completed, false) then"
  );
  const balance = db.indexOf(
    "update public.players"
  );

  assert.ok(lock >= 0);
  assert.ok(completed > lock);
  assert.ok(balance > completed);

  assert.match(
    db.slice(lock, completed),
    /for update;/i
  );
});

test("completed replay returns before all financial writes", () => {
  const completed = db.indexOf(
    "if coalesce(v_challenge.completed, false) then"
  );
  const exit = db.indexOf(
    "return;",
    completed
  );
  const balance = db.indexOf(
    "update public.players",
    completed
  );

  assert.ok(completed >= 0);
  assert.ok(exit > completed);
  assert.ok(balance > exit);
});

test("Admin changes cannot replace bound reward", () => {
  assert.match(
    db,
    /v_reward := v_snapshot\.reward_points;/i
  );

  assert.doesNotMatch(
    db,
    /v_reward := v_challenge\.reward_points;/i
  );

  assert.match(
    db,
    /reward_points\s*=\s*v_reward/i
  );
});

test("score identity and timestamp precede winner lock", () => {
  const score = db.indexOf(
    "from public.game_scores g"
  );
  const timestamp = db.indexOf(
    "v_score.played_at is distinct from"
  );
  const winner = db.indexOf(
    "from public.daily_challenges c"
  );

  assert.ok(score >= 0);
  assert.ok(timestamp > score);
  assert.ok(winner > timestamp);
});

test("ledger uniqueness uses canonical challenge ID", () => {
  assert.match(
    db,
    /insert into public\.point_transactions/i
  );

  assert.match(
    db,
    /v_challenge\.id\s*\);/i
  );
});

test("winner completion and iPOS intent precede ledger return", () => {
  const completion = db.indexOf(
    "update public.daily_challenges"
  );
  const ledger = db.indexOf(
    "insert into public.point_transactions"
  );
  const success = db.lastIndexOf(
    "return query"
  );

  assert.ok(completion >= 0);
  assert.ok(ledger > completion);
  assert.ok(success > ledger);
});
