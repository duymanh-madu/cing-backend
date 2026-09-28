"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const primary = fs.readFileSync(
  "db/migrations/20260922_cing_offline_revive_finalize_v1.sql",
  "utf8"
);

const mirror = fs.readFileSync(
  "supabase/migrations/20260922235000_cing_offline_revive_finalize_v1.sql",
  "utf8"
);

test("finalize migration mirror is identical", () => {
  assert.equal(primary, mirror);
});

test("finalize uses PostgreSQL transaction", () => {
  assert.match(primary, /^begin;/);
  assert.match(primary, /commit;\s*$/);
});

test("final result is durable on session", () => {
  assert.match(
    primary,
    /add column final_score integer/i
  );

  assert.match(
    primary,
    /add column final_best_combo integer/i
  );
});

test("finalize is a security-definer RPC", () => {
  assert.match(
    primary,
    /create function\s+public\.cing_offline_revive_finalize_v1/i
  );

  assert.match(
    primary,
    /security definer/i
  );
});

test("session transition is serialized", () => {
  assert.match(
    primary,
    /from public\.cing_offline_revive_sessions s[\s\S]*?for update/i
  );
});

test("only pending session can finalize", () => {
  assert.match(
    primary,
    /v_session\.status <> 'revive_pending'/i
  );
});

test("same request returns durable result", () => {
  assert.match(
    primary,
    /v_existing\.event_type <> 'finalized'/i
  );

  assert.match(
    primary,
    /v_score\.id::bigint/i
  );

  assert.match(
    primary,
    /REVIVAL_FINALIZE_REQUEST_CONFLICT/
  );
});

test("score uses locked session identity", () => {
  assert.match(
    primary,
    /insert into public\.game_scores/i
  );

  assert.match(
    primary,
    /v_session\.game_key,\s*v_user_id/i
  );

  assert.match(
    primary,
    /offline_revive_session_id/i
  );
});

test("finalized event and session are atomic", () => {
  assert.match(
    primary,
    /insert into public\.cing_offline_revive_events/i
  );

  assert.match(
    primary,
    /update public\.cing_offline_revive_sessions/i
  );

  assert.match(
    primary,
    /event_type[\s\S]*?'finalized'/i
  );
});

test("browser roles cannot execute finalize", () => {
  assert.match(
    primary,
    /revoke all[\s\S]*?from public, anon, authenticated, service_role;/i
  );

  assert.match(
    primary,
    /grant execute[\s\S]*?to service_role;/i
  );
});

test("finalize does not debit or grant rewards", () => {
  assert.doesNotMatch(
    primary,
    /\bupdate\s+public\.players\b/i
  );

  assert.doesNotMatch(
    primary,
    /\binsert\s+into\s+public\.point_transactions\b/i
  );

  assert.doesNotMatch(
    primary,
    /\bcing_revive_credit_apply\b/i
  );

  assert.doesNotMatch(
    primary,
    /\bcomplete_daily_challenge_atomic\b/i
  );
});
