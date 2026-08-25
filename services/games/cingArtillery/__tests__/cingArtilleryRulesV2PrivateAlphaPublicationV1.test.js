"use strict";

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
    "../../../../db/migrations/20260825_cing_artillery_rules_v2_private_alpha_publication_v1.sql"
  );

const sql =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );

test(
  "Rules V2 private-alpha publication is fail-closed and changes only rules",
  () => {
    assert.match(
      sql,
      /begin;/i
    );

    assert.match(
      sql,
      /for update;/i
    );

    assert.match(
      sql,
      /CING_ARTILLERY_RULES_V2_PUBLICATION_ROOT_GATE_NOT_FALSE/
    );

    assert.match(
      sql,
      /CING_ARTILLERY_RULES_V2_PUBLICATION_WORKER_BASELINE_MISMATCH/
    );

    assert.match(
      sql,
      /CING_ARTILLERY_RULES_V2_PUBLICATION_RULES_V1_BASELINE_MISMATCH/
    );

    assert.match(
      sql,
      /jsonb_set\s*\(\s*v_config_before\s*,\s*'\{rules\}'\s*,\s*v_rules_v2\s*,\s*false\s*\)/s
    );

    assert.match(
      sql,
      /v_config_after\s*-\s*'rules'[\s\S]*?is distinct from[\s\S]*?v_config_before\s*-\s*'rules'/i
    );

    assert.doesNotMatch(
      sql,
      /cing_artillery_config\s*=\s*'\{/i
    );

    assert.doesNotMatch(
      sql,
      /jsonb_set\s*\([^)]*'\{enabled\}'/is
    );

    assert.doesNotMatch(
      sql,
      /cing_artillery_config\s*=\s*jsonb_set\s*\([^)]*'\{enabled\}'/is
    );
  }
);

test(
  "Rules V2 publication contains exact locked 30-field candidate",
  () => {
    const match =
      sql.match(
        /v_rules_v2 constant jsonb :=\s*'(\{[\s\S]*?\})'::jsonb;/i
      );

    assert.ok(
      match,
      "v_rules_v2 JSON literal missing"
    );

    const rules =
      JSON.parse(
        match[1]
      );

    const expected = {
      version: 2,
      physics_version: 1,
      max_hp: 1000,
      turn_duration_ms: 15000,
      gravity: 980,
      wind_min: -100,
      wind_max: 100,
      angle_min_deg: 10,
      angle_max_deg: 80,
      angle_step_deg: 1,
      power_min: 0,
      power_max: 100,
      power_velocity_scale: 10,
      physics_step_ms: 10,
      max_flight_time_ms: 3000,
      physics_fixed_scale: 1000,
      trig_algorithm_version: 1,
      trig_angle_scale: 1000000000,
      trig_value_scale: 1000000000,
      projectile_radius_px: 4,
      player_hit_radius_px: 16,
      player_hit_center_offset_y_px: 23,
      muzzle_offset_forward_px: 14,
      muzzle_offset_up_px: 22,
      base_damage: 300,
      blast_radius: 120,
      blast_min_damage_ratio: 0.1,
      damage_formula_version: 1,
      damage_rounding: "floor",
      self_damage_enabled: false,
    };

    assert.deepEqual(
      rules,
      expected
    );

    assert.equal(
      Object.keys(rules).length,
      30
    );
  }
);

test(
  "publication preserves root=false and execution worker exactly",
  () => {
    assert.match(
      sql,
      /v_config_before\s*->\s*'enabled'[\s\S]*?'false'::jsonb/i
    );

    assert.match(
      sql,
      /v_expected_execution_worker constant jsonb[\s\S]*?"enabled": true[\s\S]*?"version": 1/i
    );

    assert.match(
      sql,
      /POSTCONDITION_ROOT_GATE_CHANGED/
    );

    assert.match(
      sql,
      /POSTCONDITION_WORKER_CHANGED/
    );
  }
);
