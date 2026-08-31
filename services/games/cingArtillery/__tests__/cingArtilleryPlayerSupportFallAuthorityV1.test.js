"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");


const migrationPath =
  path.resolve(
    __dirname,
    "../../../../db/migrations/" +
      "20260831_z_cing_artillery_player_support_fall_authority_v1.sql"
  );

const sql =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );


test(
  "combat terrain is a mutable per-combat snapshot",
  () => {
    assert.match(
      sql,
      /CREATE TABLE\s+public\.cing_artillery_combat_terrain_states/
    );

    assert.match(
      sql,
      /collision_mask bytea NOT NULL/
    );

    assert.match(
      sql,
      /terrain_revision bigint NOT NULL/
    );

    assert.match(
      sql,
      /CREATE UNIQUE INDEX\s+cing_artillery_combat_terrain_states_combat_uidx\s+ON public\.cing_artillery_combat_terrain_states \(\s*combat_state_id\s*\);/s
    );
  }
);


test(
  "terrain initialization copies immutable map authority",
  () => {
    assert.match(
      sql,
      /v_map\.width_px/
    );

    assert.match(
      sql,
      /v_map\.height_px/
    );

    assert.match(
      sql,
      /v_map\.collision_mask/
    );

    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_maps/i
    );
  }
);


test(
  "bitmask membership is MSB first and fails closed outside map",
  () => {
    assert.match(
      sql,
      /128 >> v_bit_offset/
    );

    assert.match(
      sql,
      /p_x >= p_width_px/
    );

    assert.match(
      sql,
      /p_y >= p_height_px/
    );

    assert.match(
      sql,
      /RETURN false/
    );
  }
);


test(
  "support footprint is distinct from projectile collider",
  () => {
    assert.match(
      sql,
      /floor\(\s*p_player_hit_radius_px \/ 2\s*\)/
    );

    assert.equal(
      (
        sql.match(
          /cing_artillery_terrain_pixel_solid_private_v1\(/g
        ) || []
      ).length >= 3,
      true
    );
  }
);


test(
  "support resolution accepts no caller position or terrain bytes",
  () => {
    const signature =
      sql.match(
        /cing_artillery_resolve_player_support_private_v1\s*\(([\s\S]*?)\)\s*RETURNS jsonb/
      );

    assert.ok(signature);

    assert.match(
      signature[1],
      /p_combat_state_id uuid/
    );

    assert.match(
      signature[1],
      /p_turn_state_id uuid/
    );

    assert.match(
      signature[1],
      /p_expected_turn_number integer/
    );

    assert.match(
      signature[1],
      /p_account_id uuid/
    );

    assert.doesNotMatch(
      signature[1],
      /position|collision_mask|width_px|height_px/i
    );
  }
);


test(
  "fall scans deterministically downward one pixel at a time",
  () => {
    assert.match(
      sql,
      /FOR v_scan_y IN/
    );

    assert.match(
      sql,
      /v_player\.position_y \+ 1/
    );

    assert.match(
      sql,
      /v_terrain\.height_px - 1/
    );

    assert.match(
      sql,
      /v_landing_y :=\s*v_scan_y/
    );
  }
);


test(
  "landing mutates runtime position but never immutable spawn",
  () => {
    assert.match(
      sql,
      /UPDATE\s+public\.cing_artillery_player_world_states[\s\S]*position_y = v_landing_y/
    );

    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_combat_world_states/i
    );
  }
);


test(
  "world exit delegates exclusively to canonical fall terminal primitive",
  () => {
    assert.equal(
      (
        sql.match(
          /cing_artillery_complete_fell_out_of_world_private\(/g
        ) || []
      ).length,
      1
    );

    assert.match(
      sql,
      /'outcome',\s*'fell_out_of_world'/
    );
  }
);


test(
  "fall terminal path does not zero or mutate HP",
  () => {
    const executable =
      sql
        .replace(
          /\/\*[\s\S]*?\*\//g,
          ""
        )
        .replace(
          /--.*$/gm,
          ""
        );

    assert.doesNotMatch(
      executable,
      /\bcurrent_hp\b|\bremaining_hp\b|\bhp\s*=|\bUPDATE\b[\s\S]*\bhp\b/i
    );
  }
);


test(
  "projectile out_of_bounds is not redefined",
  () => {
    const executable =
      sql
        .replace(
          /\/\*[\s\S]*?\*\//g,
          ""
        )
        .replace(
          /--.*$/gm,
          ""
        );

    assert.doesNotMatch(
      executable,
      /\bout_of_bounds\b/
    );
  }
);


test(
  "support result carries terrain revision for projection fencing",
  () => {
    assert.match(
      sql,
      /'terrain_revision',\s*v_terrain\.terrain_revision/
    );
  }
);


test(
  "all new terrain and fall authorities remain private",
  () => {
    assert.doesNotMatch(
      sql,
      /SECURITY DEFINER/i
    );

    assert.doesNotMatch(
      sql,
      /GRANT\s+EXECUTE/i
    );

    for (
      const role of [
        "PUBLIC",
        "anon",
        "authenticated",
        "service_role",
      ]
    ) {
      assert.match(
        sql,
        new RegExp(
          "FROM " +
            role
        )
      );
    }
  }
);


test(
  "migration is one atomic transaction",
  () => {
    assert.equal(
      (
        sql.match(
          /\bBEGIN;/g
        ) || []
      ).length,
      1
    );

    assert.equal(
      (
        sql.match(
          /\bCOMMIT;/g
        ) || []
      ).length,
      1
    );

    assert.ok(
      sql.trim().startsWith("BEGIN;")
    );

    assert.ok(
      sql.trim().endsWith("COMMIT;")
    );
  }
);


console.log(
  "PASS: wrote 5J-COMMERCIAL-1B support/fall authority"
);
