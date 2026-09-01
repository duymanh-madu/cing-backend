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
    "db/migrations",
    "20260901_zz_cing_artillery_mutable_terrain_snapshot_authority_v1.sql"
  );

const sql =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );

test(
  "mutable terrain reader is participant-authorized and read-only",
  () => {
    assert.match(
      sql,
      /cing_artillery_read_mutable_terrain_authorized_v1/u
    );

    assert.match(
      sql,
      /LANGUAGE plpgsql[\s\S]*STABLE[\s\S]*SECURITY DEFINER/u
    );

    assert.match(
      sql,
      /cing_artillery_match_runtimes/u
    );

    assert.match(
      sql,
      /r\.id = p_match_runtime_id/u
    );

    assert.match(
      sql,
      /r\.match_id = p_match_id/u
    );

    assert.match(
      sql,
      /v_runtime\.player_one_account_id/u
    );

    assert.match(
      sql,
      /v_runtime\.player_two_account_id/u
    );

    assert.match(
      sql,
      /CING_ARTILLERY_TERRAIN_READ_ACCESS_DENIED_V1/u
    );
  }
);

test(
  "mutable terrain reader returns canonical current terrain identity",
  () => {
    for (const token of [
      "combat_state_id uuid",
      "match_runtime_id uuid",
      "match_id uuid",
      "map_id uuid",
      "width_px integer",
      "height_px integer",
      "terrain_revision text",
      "collision_mask_hex text",
      "cing_artillery_combat_terrain_states",
      "terrain_revision::text",
      "'hex'",
    ]) {
      assert.ok(
        sql.includes(token),
        `missing canonical terrain token: ${token}`
      );
    }
  }
);

test(
  "mutable terrain reader fails closed for missing or invalid state",
  () => {
    for (const token of [
      "CING_ARTILLERY_TERRAIN_READ_MATCH_ID_REQUIRED_V1",
      "CING_ARTILLERY_TERRAIN_READ_RUNTIME_ID_REQUIRED_V1",
      "CING_ARTILLERY_TERRAIN_READ_ACCOUNT_ID_REQUIRED_V1",
      "CING_ARTILLERY_TERRAIN_READ_RUNTIME_NOT_FOUND_V1",
      "CING_ARTILLERY_TERRAIN_READ_NOT_FOUND_V1",
      "CING_ARTILLERY_TERRAIN_READ_STATE_INVALID_V1",
      "octet_length(v_terrain.collision_mask) = 0",
      "cing_artillery_validate_collision_bitmask_v1",
      "v_terrain.terrain_revision < 0",
    ]) {
      assert.ok(
        sql.includes(token),
        `missing fail-closed token: ${token}`
      );
    }
  }
);

test(
  "mutable terrain reader exposes service-role-only authority",
  () => {
    assert.match(
      sql,
      /REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated, service_role;/u
    );

    assert.match(
      sql,
      /GRANT EXECUTE[\s\S]*TO service_role;/u
    );
  }
);

test(
  "mutable terrain reader introduces no gameplay mutation",
  () => {
    const bodyStart =
      sql.indexOf(
        "AS $$"
      );

    const bodyEnd =
      sql.indexOf(
        "$$;",
        bodyStart
      );

    assert.notEqual(
      bodyStart,
      -1
    );

    assert.notEqual(
      bodyEnd,
      -1
    );

    const body =
      sql.slice(
        bodyStart,
        bodyEnd
      );

    for (const forbidden of [
      /\bINSERT\s+INTO\b/iu,
      /\bUPDATE\s+/iu,
      /\bDELETE\s+FROM\b/iu,
      /\bCALL\s+/iu,
      /\bPERFORM\s+public\./iu,
      /\bFOR\s+UPDATE\b/iu,
    ]) {
      assert.doesNotMatch(
        body,
        forbidden
      );
    }
  }
);
