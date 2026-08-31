const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const ROOT =
  path.resolve(
    __dirname,
    "../../../.."
  );

function read(
  relativePath
) {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath
    ),
    "utf8"
  );
}

test(
  "mutable authority bootstrap is one atomic service-role boundary",
  () => {
    const sql =
      read(
        "db/migrations/20260831_zzzzz_cing_artillery_mutable_authority_bootstrap_v1.sql"
      );

    assert.match(
      sql,
      /create or replace function public\.cing_artillery_bootstrap_mutable_authority_atomic\s*\(\s*p_combat_state_id uuid\s*\)/i
    );

    assert.match(
      sql,
      /security definer/i
    );

    assert.match(
      sql,
      /cing_artillery_get_or_create_combat_terrain_private\s*\(/i
    );

    assert.match(
      sql,
      /cing_artillery_get_or_create_player_world_states_private\s*\(/i
    );

    assert.match(
      sql,
      /v_player_world_count <> 2/i
    );

    assert.match(
      sql,
      /motion_state <> 'stable'/i
    );

    assert.match(
      sql,
      /grant execute[\s\S]*to service_role/i
    );
  }
);

test(
  "private mutable primitives stay unavailable to application roles",
  () => {
    const terrain =
      read(
        "db/migrations/20260831_z_cing_artillery_player_support_fall_authority_v1.sql"
      );

    const playerWorld =
      read(
        "db/migrations/20260831_cing_artillery_player_world_state_foundation_v1.sql"
      );

    for (
      const [source, fn]
      of [
        [
          terrain,
          "cing_artillery_get_or_create_combat_terrain_private",
        ],
        [
          playerWorld,
          "cing_artillery_get_or_create_player_world_states_private",
        ],
      ]
    ) {
      assert.match(
        source,
        new RegExp(
          `REVOKE ALL[\\s\\S]*${fn}[\\s\\S]*FROM service_role`,
          "i"
        )
      );
    }
  }
);

test(
  "realtime startup establishes mutable authority before first turn",
  () => {
    const source =
      read(
        "services/games/cingArtillery/services/cingArtilleryRealtimeService.js"
      );

    const vital =
      source.indexOf(
        "const combatVital ="
      );

    const mutable =
      source.indexOf(
        "const mutableAuthority =",
        vital
      );

    const turn =
      source.indexOf(
        "const turnState =",
        mutable
      );

    assert.notEqual(
      vital,
      -1
    );

    assert.notEqual(
      mutable,
      -1
    );

    assert.notEqual(
      turn,
      -1
    );

    assert.ok(
      vital < mutable
    );

    assert.ok(
      mutable < turn
    );

    assert.match(
      source,
      /mutableAuthority\.player_world_count\s*!==\s*2/
    );
  }
);

test(
  "node runtime calls only the atomic mutable bootstrap RPC",
  () => {
    const repository =
      read(
        "services/games/cingArtillery/repositories/cingArtilleryMutableAuthorityRepository.js"
      );

    const service =
      read(
        "services/games/cingArtillery/services/cingArtilleryMutableAuthorityService.js"
      );

    assert.match(
      repository,
      /cing_artillery_bootstrap_mutable_authority_atomic/
    );

    for (const source of [
      repository,
      service,
    ]) {
      assert.doesNotMatch(
        source,
        /cing_artillery_get_or_create_combat_terrain_private/
      );

      assert.doesNotMatch(
        source,
        /cing_artillery_get_or_create_player_world_states_private/
      );
    }
  }
);
