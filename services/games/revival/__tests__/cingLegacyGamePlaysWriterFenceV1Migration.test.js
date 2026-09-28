"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");

const sql = fs.readFileSync(
  path.join(
    root,
    "db/migrations/20260924_cing_legacy_game_plays_writer_fence_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260924233000_cing_legacy_game_plays_writer_fence_v1.sql"
  ),
  "utf8"
);

const executable = sql
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n]*/g, "");

test("migration mirrors exactly", () => {
  assert.equal(mirror, sql);
});

test("installation starts with an OPEN gate", () => {
  assert.match(
    executable,
    /is_closed boolean not null\s+default false/i
  );

  assert.match(
    executable,
    /values\s*\(\s*1,\s*false\s*\)/i
  );

  assert.doesNotMatch(
    executable,
    /\bupdate\s+public\.cing_legacy_game_plays_writer_gate\b/i
  );
});

test("gate is restricted to one canonical row", () => {
  assert.match(
    executable,
    /gate_id integer primary key/i
  );

  assert.match(
    executable,
    /check\s*\(\s*gate_id = 1\s*\)/i
  );
});

test("changed balances participate in the gate lock", () => {
  assert.match(
    executable,
    /NEW\.game_plays\s+is not distinct from\s+OLD\.game_plays/i
  );

  assert.match(
    executable,
    /from\s+public\.cing_legacy_game_plays_writer_gate g[\s\S]*?for share/i
  );
});

test("closed gate rejects legacy balance changes", () => {
  assert.match(
    executable,
    /if not v_is_closed then\s+return NEW;/i
  );

  assert.match(
    executable,
    /LEGACY_GAME_PLAYS_WRITER_FENCED/
  );

  assert.match(
    executable,
    /LEGACY_GAME_PLAYS_GATE_MISSING/
  );
});

test("closed gate allows a new player with zero plays", () => {
  assert.match(
    executable,
    /if TG_OP = 'INSERT' then[\s\S]*?coalesce\(NEW\.game_plays,\s*0\) = 0/i
  );
});

test("both player write entrypoints are guarded", () => {
  assert.match(
    executable,
    /before update of game_plays\s+on public\.players/i
  );

  assert.match(
    executable,
    /before insert\s+on public\.players/i
  );
});

test("application roles cannot mutate gate directly", () => {
  assert.match(
    executable,
    /revoke all\s+on table\s+public\.cing_legacy_game_plays_writer_gate\s+from\s+public,\s*anon,\s*authenticated,\s*service_role/i
  );

  assert.doesNotMatch(
    executable,
    /grant\s+(?:all|update|insert|delete)[\s\S]*?on table\s+public\.cing_legacy_game_plays_writer_gate/i
  );
});

test("guard function is not directly executable by app roles", () => {
  assert.match(
    executable,
    /revoke all\s+on function\s+public\.cing_legacy_game_plays_writer_guard_v1\(\)\s+from\s+public,\s*anon,\s*authenticated,\s*service_role/i
  );
});

test("migration does not execute conversion or mutate money", () => {
  assert.doesNotMatch(
    executable,
    /\b(?:update|delete from)\s+public\.players\b/i
  );

  assert.doesNotMatch(
    executable,
    /\b(?:update|insert into|delete from)\s+public\.(?:cing_wallet_balances|cing_wallet_transactions|point_transactions|game_play_transactions|cing_revive_credit_balances|cing_revive_credit_transactions)\b/i
  );

  assert.doesNotMatch(
    executable,
    /\bselect\s+[\s\S]*?\bfrom\s+public\.cing_revive_credit_convert_legacy_player_v1\s*\(/i
  );
});
