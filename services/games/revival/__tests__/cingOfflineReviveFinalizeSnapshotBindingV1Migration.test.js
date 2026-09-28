"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(
  __dirname,
  "../../../.."
);

const sql = fs.readFileSync(
  path.join(
    root,
    "db/migrations/20260923_cing_offline_revive_finalize_snapshot_binding_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260923124000_cing_offline_revive_finalize_snapshot_binding_v1.sql"
  ),
  "utf8"
);

test("SQL mirrors are identical", () => {
  assert.equal(sql, mirror);
});

test("migration is additive", () => {
  assert.match(
    sql,
    /^begin;/
  );

  assert.match(
    sql,
    /commit;\s*$/
  );

  assert.match(
    sql,
    /create or replace function\s+public\.cing_offline_revive_finalize_v1/i
  );
});

test("session records snapshot ID", () => {
  assert.match(
    sql,
    /add column challenge_snapshot_id uuid/i
  );

  assert.match(
    sql,
    /challenge_snapshot_id\s*=\s*v_snapshot_id/i
  );
});

test("session lock precedes config lock", () => {
  const session = sql.indexOf(
    "from public.cing_offline_revive_sessions s"
  );

  const config = sql.indexOf(
    "from public.app_configs c"
  );

  const score = sql.indexOf(
    "insert into public.game_scores"
  );

  assert.ok(
    session >= 0 &&
    config > session &&
    score > config
  );
});

test("Admin Apply serialization lock exists", () => {
  assert.match(
    sql,
    /from public\.app_configs c\s+where c\.id = 1\s+for update;/i
  );
});

test("latest Vietnam-date snapshot is selected", () => {
  assert.match(
    sql,
    /s\.game_key = v_session\.game_key/i
  );

  assert.match(
    sql,
    /at time zone 'Asia\/Ho_Chi_Minh'/i
  );

  assert.match(
    sql,
    /s\.applied_at <= v_finalized_at/i
  );

  assert.match(
    sql,
    /order by\s+s\.applied_at desc,\s*s\.snapshot_id desc\s+limit 1;/i
  );
});

test("disabled snapshot remains selectable", () => {
  assert.doesNotMatch(
    sql,
    /s\.enabled\s*=\s*true/i
  );
});

test("score and session share finalized timestamp", () => {
  assert.match(
    sql,
    /v_finalized_at := clock_timestamp\(\);/i
  );

  assert.match(
    sql,
    /score,\s*played_at,\s*offline_revive_session_id/i
  );

  assert.match(
    sql,
    /p_final_score,\s*v_finalized_at,\s*v_session\.id/i
  );

  assert.match(
    sql,
    /finalized_at = v_finalized_at/i
  );
});

test("Finalize still does not award points", () => {
  assert.doesNotMatch(
    sql,
    /insert into\s+public\.point_transactions/i
  );

  assert.doesNotMatch(
    sql,
    /complete_daily_challenge_atomic\s*\(/i
  );
});
