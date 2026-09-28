"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../..");

const db = fs.readFileSync(
  path.join(
    ROOT,
    "db/migrations/20260924_cing_block_puzzle_free_start_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    ROOT,
    "supabase/migrations/20260924181000_cing_block_puzzle_free_start_v1.sql"
  ),
  "utf8"
);

test("Free-start migration mirror is identical", () => {
  assert.equal(db, mirror);
});

test("existing paid sessions remain schema-valid", () => {
  assert.match(
    db,
    /check \(play_cost in \(0, 1\)\)/i
  );

  assert.match(
    db,
    /validate constraint/i
  );
});

test("effective V4 start RPC is transformed, not reconstructed", () => {
  assert.match(
    db,
    /pg_get_functiondef\(v_oid\)/i
  );

  assert.match(
    db,
    /p_replay_version = 4/i
  );

  assert.match(
    db,
    /p_replay_version = 3/i
  );

  assert.match(
    db,
    /p_replay_version = 2/i
  );

  assert.match(
    db,
    /execute v_definition;/i
  );
});

test("old play balance debit is removed from new start", () => {
  assert.match(
    db,
    /BLOCK_PUZZLE_FREE_START_DEBIT_BOUNDARY_MISMATCH/
  );

  assert.match(
    db,
    /v_debit_start/i
  );

  assert.match(
    db,
    /game_plays - 1/i
  );

  assert.match(
    db,
    /v_debit_end/i
  );
});

test("start-only ledger and compatibility event are removed", () => {
  assert.match(
    db,
    /BLOCK_PUZZLE_FREE_START_LEDGER_BOUNDARY_MISMATCH/
  );

  assert.match(
    db,
    /v_ledger_start/i
  );

  assert.match(
    db,
    /v_ledger_end/i
  );

  assert.match(
    db,
    /plays_deducted/i
  );
});

test("new session cost is zero", () => {
  assert.match(
    db,
    /p_replay_version\[.*?\]/s
  );

  assert.match(
    db,
    /BLOCK_PUZZLE_FREE_START_COST_OCCURRENCE_INVALID/
  );

  assert.match(
    db,
    /'    0,'/
  );
});

test("backend-only execution authority is preserved", () => {
  assert.match(
    db,
    /revoke all[\s\S]*from public, anon, authenticated;/i
  );

  assert.match(
    db,
    /grant execute[\s\S]*to service_role;/i
  );
});

test("migration is transactional", () => {
  assert.match(db, /^begin;/i);
  assert.match(db, /commit;\s*$/i);
});


test("start RPC requires free_offline after migration", () => {
  assert.match(
    db,
    /BLOCK_PUZZLE_FREE_START_POLICY_GUARD_MISMATCH/
  );

  assert.match(
    db,
    /v_economy_type <> ''free_offline''/
  );

  assert.match(
    db,
    /BLOCK_PUZZLE_REQUIRES_FREE_OFFLINE/
  );
});

test("postcheck excludes historical block comments", () => {
  assert.match(
    db,
    /regexp_replace\([\s\S]*v_definition,[\s\S]*'gs'/
  );

  assert.match(
    db,
    /position\('v_player\.game_plays' in v_lower\) > 0/
  );
});

test("all three games transition to free_offline atomically", () => {
  for (const key of [
    "cing-block-puzzle",
    "cing-stack-tower",
    "black-pearl-rush",
  ]) {
    assert.ok(
      db.includes(`'${key}'`),
      `Missing economy policy: ${key}`
    );
  }

  assert.match(
    db,
    /select game_economy_config[\s\S]*for update;/i
  );

  assert.match(
    db,
    /'"free_offline"'::jsonb/
  );

  assert.match(
    db,
    /set game_economy_config = v_config/
  );

  assert.match(
    db,
    /end;\s*\$policy\$;\s*commit;/i
  );
});

test("other game policies and existing metadata survive", () => {
  assert.match(
    db,
    /v_games := v_config -> 'games'/
  );

  assert.match(
    db,
    /v_entry := v_games -> v_key/
  );

  assert.match(
    db,
    /jsonb_set\([\s\S]*array\[v_key\]/
  );

  assert.doesNotMatch(
    db,
    /update public\.players\s+set/i
  );

  assert.doesNotMatch(
    db,
    /delete from public\.game_play_transactions/i
  );
});
