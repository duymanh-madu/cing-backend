const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const test =
  require("node:test");

const migrationPath =
  "supabase/migrations/20260901104500_cing_artillery_combat_character_identity_snapshot_v1.sql";

const source =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );


test(
  "creates immutable combat character snapshot authority",
  () => {
    assert.match(
      source,
      /CREATE TABLE IF NOT EXISTS\s+public\.cing_artillery_combat_character_snapshots/iu
    );

    for (const column of [
      "combat_state_id",
      "match_runtime_id",
      "match_id",
      "participant_slot",
      "account_id",
      "character_key",
      "character_name",
      "gender",
      "snapshotted_at",
    ]) {
      assert.match(
        source,
        new RegExp(
          `\\b${column}\\b`,
          "u"
        )
      );
    }
  }
);


test(
  "freezes exactly player one and player two",
  () => {
    assert.match(
      source,
      /'player_one'/u
    );

    assert.match(
      source,
      /'player_two'/u
    );

    assert.match(
      source,
      /v_inserted_count\s*<>\s*2/iu
    );
  }
);


test(
  "uses canonical combat insertion as freeze boundary",
  () => {
    assert.match(
      source,
      /AFTER INSERT\s+ON public\.cing_artillery_combat_states/iu
    );

    assert.match(
      source,
      /FOR EACH ROW/iu
    );

    assert.match(
      source,
      /NEW\.id/u
    );
  }
);


test(
  "locks canonical character rows deterministically",
  () => {
    const start =
      source.indexOf(
        "PERFORM c.account_id"
      );

    const end =
      source.indexOf(
        "SELECT c.*",
        start
      );

    assert.ok(
      start >= 0 &&
      end > start
    );

    const block =
      source.slice(
        start,
        end
      );

    assert.match(
      block,
      /ORDER BY c\.account_id/iu
    );

    assert.match(
      block,
      /FOR UPDATE/iu
    );
  }
);


test(
  "reads identity from artillery character authority",
  () => {
    assert.match(
      source,
      /FROM public\.cing_artillery_characters AS c/iu
    );

    for (const field of [
      "character_key",
      "character_name",
      "gender",
    ]) {
      assert.match(
        source,
        new RegExp(
          `v_player_one\\.${field}`,
          "u"
        )
      );

      assert.match(
        source,
        new RegExp(
          `v_player_two\\.${field}`,
          "u"
        )
      );
    }
  }
);


test(
  "service role has read only table authority",
  () => {
    assert.match(
      source,
      /GRANT SELECT[\s\S]*cing_artillery_combat_character_snapshots[\s\S]*TO service_role/iu
    );

    assert.doesNotMatch(
      source,
      /GRANT\s+(INSERT|UPDATE|DELETE|ALL)[\s\S]*cing_artillery_combat_character_snapshots[\s\S]*TO service_role/iu
    );
  }
);


test(
  "private freeze primitive is unavailable to application roles",
  () => {
    for (const role of [
      "PUBLIC",
      "anon",
      "authenticated",
      "service_role",
    ]) {
      assert.match(
        source,
        new RegExp(
          "REVOKE ALL[\\s\\S]*" +
          "cing_artillery_freeze_combat_character_identity_private_v1" +
          "[\\s\\S]*FROM " +
          role,
          "iu"
        )
      );
    }
  }
);


test(
  "snapshot authority owns no gameplay mechanics",
  () => {
    const start =
      source.indexOf(
        "CREATE OR REPLACE FUNCTION\n" +
        "  public.cing_artillery_freeze_combat_character_identity_private_v1"
      );

    const end =
      source.indexOf(
        "CREATE OR REPLACE FUNCTION\n" +
        "  public.cing_artillery_combat_character_snapshot_trigger_v1",
        start
      );

    assert.ok(
      start >= 0 &&
      end > start
    );

    const block =
      source.slice(
        start,
        end
      );

    for (const forbidden of [
      "current_hp",
      "damage",
      "wind",
      "turn_number",
      "position_x",
      "position_y",
      "collision_mask",
      "terrain_revision",
      "winner_account_id",
      "loser_account_id",
    ]) {
      assert.doesNotMatch(
        block,
        new RegExp(
          forbidden,
          "iu"
        )
      );
    }
  }
);


test(
  "snapshot uniqueness fences slot and account identity",
  () => {
    assert.match(
      source,
      /UNIQUE\s*\(\s*combat_state_id,\s*participant_slot\s*\)/iu
    );

    assert.match(
      source,
      /UNIQUE\s*\(\s*combat_state_id,\s*account_id\s*\)/iu
    );
  }
);
