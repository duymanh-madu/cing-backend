const fs =
  require("node:fs");
const path =
  require("node:path");
const test =
  require("node:test");
const assert =
  require("node:assert/strict");

const migrationPath =
  path.resolve(
    __dirname,
    "../../../../db/migrations/20260831_zzzzzz_cing_artillery_mutable_shot_execution_context_v1.sql"
  );

const sql =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );

test(
  "mutable shot execution context V1 binds canonical terrain revision",
  () => {
    assert.match(
      sql,
      /ADD COLUMN IF NOT EXISTS expected_terrain_revision bigint/iu
    );

    assert.match(
      sql,
      /CREATE OR REPLACE FUNCTION\s+public\.cing_artillery_materialize_shot_execution_context_atomic/iu
    );

    assert.match(
      sql,
      /SECURITY DEFINER/iu
    );

    assert.match(
      sql,
      /v_execution\.claim_token IS DISTINCT FROM p_claim_token/iu
    );

    assert.match(
      sql,
      /v_execution\.locked_until <= v_now/iu
    );

    assert.match(
      sql,
      /v_turn\.turn_number <> v_execution\.turn_number/iu
    );

    assert.match(
      sql,
      /v_turn\.status <> 'active'/iu
    );

    assert.match(
      sql,
      /v_player_one\.motion_state <> 'stable'/iu
    );

    assert.match(
      sql,
      /v_player_two\.motion_state <> 'stable'/iu
    );

    assert.match(
      sql,
      /v_command\.shooter_account_id = v_player_one\.account_id/iu
    );

    assert.match(
      sql,
      /v_command\.shooter_account_id = v_player_two\.account_id/iu
    );

    assert.match(
      sql,
      /expected_terrain_revision = v_terrain\.terrain_revision/iu
    );

    assert.match(
      sql,
      /CING_ARTILLERY_EXECUTION_CONTEXT_TERRAIN_STALE/iu
    );

    assert.match(
      sql,
      /'shooter_position_x', v_shooter\.position_x/iu
    );

    assert.match(
      sql,
      /'opponent_position_x', v_opponent\.position_x/iu
    );

    assert.match(
      sql,
      /encode\(v_terrain\.collision_mask, 'hex'\)/iu
    );

    assert.match(
      sql,
      /'rules_snapshot', v_combat\.rules_snapshot/iu
    );

    assert.match(
      sql,
      /FROM public\.cing_artillery_combat_world_states/iu
    );

    assert.match(
      sql,
      /v_world\.initial_wind_scaled IS NULL/iu
    );

    assert.match(
      sql,
      /'initial_wind_scaled', v_world\.initial_wind_scaled/iu
    );

    assert.doesNotMatch(
      sql,
      /v_combat\.wind/iu
    );

    assert.match(
      sql,
      /REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated/iu
    );

    assert.match(
      sql,
      /GRANT EXECUTE[\s\S]*TO service_role/iu
    );
  }
);

test(
  "mutable execution context does not use immutable combat-world spawn coordinates",
  () => {
    assert.doesNotMatch(
      sql,
      /player_one_x|player_one_y|player_two_x|player_two_y/iu
    );

    assert.match(
      sql,
      /FROM public\.cing_artillery_combat_world_states/iu
    );

    assert.match(
      sql,
      /'initial_wind_scaled', v_world\.initial_wind_scaled/iu
    );

    assert.doesNotMatch(
      sql,
      /v_world\.player_one_x|v_world\.player_one_y|v_world\.player_two_x|v_world\.player_two_y/iu
    );
  }
);

test(
  "mutable execution context does not mutate gameplay settlement",
  () => {
    assert.doesNotMatch(
      sql,
      /apply_terrain_crater_private/iu
    );

    assert.doesNotMatch(
      sql,
      /advance_turn_private/iu
    );

    assert.doesNotMatch(
      sql,
      /complete_combat_private/iu
    );

    assert.doesNotMatch(
      sql,
      /complete_fell_out_of_world_private/iu
    );
  }
);
