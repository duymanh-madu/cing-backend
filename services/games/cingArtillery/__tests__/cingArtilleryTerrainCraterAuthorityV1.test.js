"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const test =
  require("node:test");

const migrationPath =
  "db/migrations/20260831_zz_cing_artillery_terrain_crater_authority_v1.sql";

const sql = fs.readFileSync(
  migrationPath,
  "utf8"
);

test(
  "crater V1 is private and combat/resolution scoped",
  () => {
    assert.match(
      sql,
      /cing_artillery_apply_terrain_crater_private_v1\s*\(\s*p_combat_state_id uuid,\s*p_shot_resolution_id uuid/s
    );

    assert.match(
      sql,
      /FROM public\.cing_artillery_combat_states[\s\S]*FOR UPDATE/
    );

    assert.match(
      sql,
      /FROM public\.cing_artillery_shot_resolutions[\s\S]*WHERE id = p_shot_resolution_id[\s\S]*FOR SHARE/
    );

    assert.match(
      sql,
      /v_resolution\.combat_state_id <>[\s\S]*p_combat_state_id/
    );

    assert.match(
      sql,
      /FROM public\.cing_artillery_combat_terrain_states[\s\S]*WHERE combat_state_id = p_combat_state_id[\s\S]*FOR UPDATE/
    );
  }
);


test(
  "crater V1 follows canonical initialized combat lifecycle",
  () => {
    assert.match(
      sql,
      /v_combat\.status <> 'initialized'/
    );

    assert.match(
      sql,
      /CING_ARTILLERY_CRATER_COMBAT_NOT_INITIALIZED/
    );

    assert.doesNotMatch(
      sql,
      /v_combat\.status <> 'active'/
    );
  }
);


test(
  "crater V1 accepts only canonical terrain_hit",
  () => {
    assert.match(
      sql,
      /v_resolution\.outcome <> 'terrain_hit'/
    );

    assert.match(
      sql,
      /CING_ARTILLERY_CRATER_RESOLUTION_NOT_TERRAIN_HIT/
    );
  }
);


test(
  "crater V1 uses exact impact authority for membership",
  () => {
    assert.match(
      sql,
      /impact_start_x_scaled/
    );

    assert.match(
      sql,
      /impact_start_y_scaled/
    );

    assert.match(
      sql,
      /impact_delta_x_scaled/
    );

    assert.match(
      sql,
      /impact_delta_y_scaled/
    );

    assert.match(
      sql,
      /impact_contact_kind/
    );

    assert.match(
      sql,
      /cing_artillery_validate_contact_parameter_private_v1/
    );

    assert.match(
      sql,
      /cing_artillery_classify_affine_point_circle_private_v1/
    );
  }
);


test(
  "crater V1 derives radius from immutable combat rules",
  () => {
    assert.match(
      sql,
      /v_rules := v_combat\.rules_snapshot/
    );

    assert.match(
      sql,
      /cing_artillery_blast_radius_scaled_private_v1/
    );

    assert.doesNotMatch(
      sql,
      /p_(?:blast_)?radius/
    );
  }
);


test(
  "crater V1 mutates only per-combat collision mask",
  () => {
    assert.match(
      sql,
      /UPDATE\s+public\.cing_artillery_combat_terrain_states/
    );

    assert.match(
      sql,
      /collision_mask = v_new_mask/
    );

    assert.match(
      sql,
      /terrain_revision =[\s\S]*terrain_revision \+ 1/
    );

    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_maps/
    );

    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_map_versions/
    );
  }
);


test(
  "crater V1 preserves canonical MSB-first bit ordering",
  () => {
    assert.match(
      sql,
      /128 >> v_bit_offset/
    );

    assert.match(
      sql,
      /get_byte\s*\(/
    );

    assert.match(
      sql,
      /set_byte\s*\(/
    );

    assert.match(
      sql,
      /cing_artillery_validate_collision_bitmask_v1/
    );
  }
);


test(
  "crater V1 is clear-only and revision fenced",
  () => {
    assert.match(
      sql,
      /v_old_byte &[\s\S]*\(255 # v_bit_mask\)/
    );

    assert.match(
      sql,
      /terrain_revision =[\s\S]*terrain_revision \+ 1/
    );

    assert.match(
      sql,
      /AND terrain_revision =[\s\S]*v_terrain\.terrain_revision/
    );

    assert.match(
      sql,
      /GET DIAGNOSTICS[\s\S]*v_row_count = ROW_COUNT/
    );

    assert.match(
      sql,
      /v_row_count <> 1/
    );
  }
);


test(
  "crater V1 does not own later settlement responsibilities",
  () => {
    assert.doesNotMatch(
      sql,
      /cing_artillery_resolve_player_support_private_v1\s*\(/
    );

    assert.doesNotMatch(
      sql,
      /cing_artillery_advance_turn_private\s*\(/
    );

    assert.doesNotMatch(
      sql,
      /cing_artillery_complete_fell_out_of_world_private\s*\(/
    );

    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_player_vital_states/
    );
  }
);


test(
  "crater V1 exposes no application-role execute",
  () => {
    assert.match(
      sql,
      /REVOKE ALL[\s\S]*cing_artillery_apply_terrain_crater_private_v1[\s\S]*FROM PUBLIC, anon, authenticated, service_role/
    );

    assert.doesNotMatch(
      sql,
      /GRANT EXECUTE/
    );
  }
);
