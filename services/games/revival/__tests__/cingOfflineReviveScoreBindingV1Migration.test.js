"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const primary = fs.readFileSync(
  "db/migrations/20260922_cing_offline_revive_score_binding_v1.sql",
  "utf8"
);

const mirror = fs.readFileSync(
  "supabase/migrations/20260922234500_cing_offline_revive_score_binding_v1.sql",
  "utf8"
);

test("offline revival score migration mirrors match", () => {
  assert.equal(primary, mirror);
});

test("score binding uses PostgreSQL transaction", () => {
  assert.match(primary, /^begin;/);
  assert.match(primary, /commit;\s*$/);
});

test("score session binding uses independent UUID column", () => {
  assert.match(
    primary,
    /add column if not exists\s+offline_revive_session_id uuid/i
  );

  assert.match(
    primary,
    /REVIVAL_SCORE_SESSION_COLUMN_TYPE_INVALID/
  );
});

test("bound score references a durable revival session", () => {
  assert.match(
    primary,
    /foreign key\s*\(\s*offline_revive_session_id\s*\)/i
  );

  assert.match(
    primary,
    /references\s+public\.cing_offline_revive_sessions\s*\(\s*id\s*\)/i
  );

  assert.match(primary, /on delete restrict/i);
});

test("one revival session can persist at most one score", () => {
  assert.match(
    primary,
    /create unique index\s+game_scores_offline_revive_session_uq/i
  );

  assert.match(
    primary,
    /where\s+offline_revive_session_id is not null/i
  );
});

test("binding is limited to two generic offline games", () => {
  assert.match(
    primary,
    /game_key in\s*\(\s*'cing-stack-tower',\s*'black-pearl-rush'\s*\)/i
  );
});

test("migration does not mutate existing game scores", () => {
  assert.doesNotMatch(
    primary,
    /\bupdate\s+public\.game_scores\b/i
  );

  assert.doesNotMatch(
    primary,
    /\bdelete\s+from\s+public\.game_scores\b/i
  );

  assert.doesNotMatch(
    primary,
    /\binsert\s+into\s+public\.game_scores\b/i
  );
});

test("migration does not alter Wallet or loyalty", () => {
  assert.doesNotMatch(
    primary,
    /\bpublic\.cing_wallet\b|\bpublic\.point_transactions\b/i
  );
});
