"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const migrationPath =
  path.resolve(
    __dirname,
    "../../../../db/migrations/20260831_cing_artillery_player_world_snapshot_read_authority_v1.sql"
  );

const sql =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );

test(
  "player world snapshot read is service-role-only and read-only",
  () => {
    assert.match(
      sql,
      /cing_artillery_read_player_world_snapshot_internal_v1/i
    );

    assert.match(
      sql,
      /SECURITY DEFINER/i
    );

    assert.match(
      sql,
      /STABLE/i
    );

    assert.match(
      sql,
      /p\.combat_state_id\s*=\s*p_combat_state_id/i
    );

    assert.match(
      sql,
      /p\.match_runtime_id\s*=\s*p_match_runtime_id/i
    );

    assert.match(
      sql,
      /p\.match_id\s*=\s*p_match_id/i
    );

    assert.match(
      sql,
      /v_count\s*<>\s*2/i
    );

    assert.match(
      sql,
      /ORDER BY\s+p\.participant_slot\s+ASC/i
    );

    assert.match(
      sql,
      /GRANT EXECUTE[\s\S]*TO service_role/i
    );

    assert.match(
      sql,
      /REVOKE ALL[\s\S]*FROM authenticated/i
    );

    assert.doesNotMatch(
      sql,
      /\bINSERT\b|\bUPDATE\b|\bDELETE\b/i
    );
  }
);
