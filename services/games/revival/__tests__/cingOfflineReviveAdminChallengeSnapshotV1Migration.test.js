"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(
  __dirname,
  "../../../.."
);

const DB = path.join(
  ROOT,
  "db/migrations/20260923_cing_offline_revive_admin_challenge_snapshot_v1.sql"
);

const SB = path.join(
  ROOT,
  "supabase/migrations/20260923122000_cing_offline_revive_admin_challenge_snapshot_v1.sql"
);

const sql = fs.readFileSync(
  DB,
  "utf8"
);

test(
  "Admin snapshot SQL mirrors are identical",
  () => {
    assert.equal(
      sql,
      fs.readFileSync(SB, "utf8")
    );
  }
);

test(
  "migration has a transaction boundary",
  () => {
    assert.match(sql, /^begin;/i);
    assert.match(sql, /commit;\s*$/i);
  }
);

test(
  "snapshot is V2 offline-games scoped",
  () => {
    assert.match(
      sql,
      /'black-pearl-rush'/
    );

    assert.match(
      sql,
      /'cing-stack-tower'/
    );

    assert.match(
      sql,
      /check\s*\(\s*game_key in/i
    );
  }
);

test(
  "Admin challenge attributes are durable",
  () => {
    for (const field of [
      "snapshot_id uuid not null",
            "apply_request_id uuid not null",
            "challenge_id uuid",
            "enabled boolean not null",
            "actor_admin_id text not null",
      "challenge_date date not null",
      "challenge_type text",
      "target_value integer",
      "reward_points integer",
    ]) {
      assert.ok(
        sql.includes(field),
        field
      );
    }
  }
);

test(
  "config time belongs to PostgreSQL",
  () => {
    assert.match(
      sql,
      /applied_at timestamptz not null\s+default clock_timestamp\(\)/i
    );
  }
);

test(
  "multiple revisions within a day are allowed",
  () => {
    assert.match(
      sql,
      /snapshot_id uuid not null\s+default gen_random_uuid\(\)\s+primary key/i
    );

    assert.match(
      sql,
      /unique\s*\(\s*apply_request_id,\s*game_key\s*\)/i
    );

    // Check executable SQL, not explanatory comments.
    const executableSql = sql
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/--[^\n]*/g, "");

    assert.doesNotMatch(
      executableSql,
      /unique\s*\(\s*challenge_date,\s*game_key\s*\)/i
    );
  }
);

test(
  "only explicit Admin sync source is allowed",
  () => {
    assert.match(
      sql,
      /source text not null\s+default 'admin_sync'/i
    );

    assert.match(
      sql,
      /check\s*\(\s*source = 'admin_sync'\s*\)/i
    );
  }
);

test(
  "browser cannot access snapshot table",
  () => {
    assert.match(
      sql,
      /revoke all[\s\S]*?from\s+public,\s*anon,\s*authenticated,\s*service_role/i
    );

    assert.match(
      sql,
      /grant select, insert[\s\S]*?to service_role/i
    );
  }
);

test(
  "migration does not perform reward mutation",
  () => {
    assert.doesNotMatch(
      sql,
      /\bcomplete_daily_challenge_atomic\s*\(/i
    );

    assert.doesNotMatch(
      sql,
      /\bupdate\s+public\.players\b/i
    );

    assert.doesNotMatch(
      sql,
      /\binsert\s+into\s+public\.point_transactions\b/i
    );
  }
);

test(
  "migration does not rewrite old challenge records",
  () => {
    assert.doesNotMatch(
      sql,
      /\bupdate\s+public\.daily_challenges\b/i
    );

    assert.doesNotMatch(
      sql,
      /\bdelete\s+from\s+public\.daily_challenges\b/i
    );
  }
);

test(
  "disabled snapshot is represented explicitly",
  () => {
    assert.match(
      sql,
      /enabled boolean not null/i
    );

    assert.match(
      sql,
      /enabled = false\s+and challenge_id is null\s+and challenge_type is null\s+and target_value is null\s+and reward_points is null/i
    );

    assert.match(
      sql,
      /enabled = true\s+and challenge_id is not null\s+and challenge_type is not null\s+and target_value is not null\s+and reward_points is not null/i
    );
  }
);

test(
  "Admin actor must be recorded",
  () => {
    assert.match(
      sql,
      /actor_admin_id text not null/i
    );

    assert.match(
      sql,
      /length\(btrim\(actor_admin_id\)\) > 0/i
    );
  }
);

test(
  "Admin apply retry has a durable identity",
  () => {
    assert.match(
      sql,
      /apply_request_id uuid not null/i
    );

    assert.match(
      sql,
      /unique\s*\(\s*apply_request_id,\s*game_key\s*\)/i
    );
  }
);
