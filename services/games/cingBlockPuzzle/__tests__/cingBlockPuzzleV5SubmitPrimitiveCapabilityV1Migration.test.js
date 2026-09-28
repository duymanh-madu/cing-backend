"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");
const db = path.join(root, "db/migrations/20260925_cing_block_puzzle_v5_submit_primitive_capability_v1.sql");
const mirror = path.join(root, "supabase/migrations/20260925011500_cing_block_puzzle_v5_submit_primitive_capability_v1.sql");

test("V5 submit primitive capability migration mirrors match byte for byte", () => {
  assert.deepEqual(fs.readFileSync(db), fs.readFileSync(mirror));
});

test("V5 primitive preserves the effective 7-argument SQL function and fails closed", () => {
  const sql = fs.readFileSync(db, "utf8");
  assert.match(sql, /cing_block_puzzle_submit_session_atomic\('/);
  assert.match(sql, /uuid,text,integer,text,integer,integer,integer\)'/);
  assert.match(sql, /cing_block_puzzle_sessions_versions_ck/);
  assert.match(sql, /BLOCK_PUZZLE_V5_PRIMITIVE_WRAPPER_NOT_READY/);
  assert.match(sql, /v_v4_matches <> 1/);
  assert.match(sql, /v_session\.replay_version = 5/);
  assert.match(sql, /BLOCK_PUZZLE_SUBMIT_REPLAY_CONFLICT/);
  assert.match(sql, /v_definition := replace\(v_definition, v_v4, v_v4 \|\| v_v5\)/);
  assert.match(sql, /p\.proacl is distinct from v_acl/);
  assert.doesNotMatch(sql, /\b(?:update|insert into|delete from)\s+public\.(?:players|point_transactions|game_play_transactions|cing_wallet)/i);
});
