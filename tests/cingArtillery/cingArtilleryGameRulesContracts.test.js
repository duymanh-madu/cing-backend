"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  normalizeGameRules,
  assertRulesVersionMatches,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryGameRulesContracts"
  );

/*
 * Contract fixtures only.
 *
 * These values DO NOT define production calibration or
 * gameplay balance. They exist solely to exercise the
 * structural invariants of the V1/V2 contracts.
 */

function buildValidV1() {
  return {
    version: 1,
    max_hp: 1000,
    turn_duration_ms: 15000,
    gravity: 980,
    wind_min: -100,
    wind_max: 100,
    angle_min_deg: 10,
    angle_max_deg: 80,
    power_min: 0,
    power_max: 100,
    base_damage: 300,
    blast_radius: 120,
  };
}

function buildValidV2() {
  return {
    version: 2,
    physics_version: 1,

    max_hp: 1000,
    turn_duration_ms: 15000,

    gravity: 980,
    wind_min: -100,
    wind_max: 100,

    angle_min_deg: 10,
    angle_max_deg: 80,

    power_min: 0,
    power_max: 100,
    power_velocity_scale: 1,

    physics_step_ms: 10,
    max_flight_time_ms: 1000,
    physics_fixed_scale: 1000,

    projectile_radius_px: 1,

    player_hit_radius_px: 2,
    player_hit_center_offset_y_px: 1,

    muzzle_offset_forward_px: 0,
    muzzle_offset_up_px: 1,

    base_damage: 300,
    blast_radius: 120,
    blast_min_damage_ratio: 0.1,

    damage_formula_version: 1,
    damage_rounding: "floor",

    self_damage_enabled: false,
  };
}

test(
  "Rules V1 remains backward compatible",
  () => {
    const raw =
      buildValidV1();

    const normalized =
      normalizeGameRules(raw);

    assert.equal(
      normalized.version,
      1
    );

    assert.deepEqual(
      normalized,
      raw
    );

    assert.equal(
      assertRulesVersionMatches({
        rulesVersion: 1,
        rules: normalized,
      }),
      1
    );

    assert.ok(
      Object.isFrozen(normalized)
    );
  }
);

test(
  "Rules V2 normalizes full physics contract",
  () => {
    const raw =
      buildValidV2();

    const normalized =
      normalizeGameRules(raw);

    assert.deepEqual(
      normalized,
      raw
    );

    assert.equal(
      assertRulesVersionMatches({
        rulesVersion: 2,
        rules: normalized,
      }),
      2
    );

    assert.ok(
      Object.isFrozen(normalized)
    );
  }
);

test(
  "Rules V2 rejects unknown keys",
  () => {
    const raw = {
      ...buildValidV2(),
      undocumented_physics_value: 1,
    };

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_INVALID_GAME_RULES",
      }
    );
  }
);

test(
  "Rules V2 rejects missing keys",
  () => {
    const raw =
      buildValidV2();

    delete raw.physics_step_ms;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_INVALID_GAME_RULES",
      }
    );
  }
);

test(
  "Rules V2 rejects non-divisible fixed-step flight horizon",
  () => {
    const raw =
      buildValidV2();

    raw.max_flight_time_ms = 1001;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_INVALID_GAME_RULES",
      }
    );
  }
);

test(
  "Rules V2 rejects projectile radius >= player radius",
  () => {
    const raw =
      buildValidV2();

    raw.projectile_radius_px =
      raw.player_hit_radius_px;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_INVALID_GAME_RULES",
      }
    );
  }
);

test(
  "Rules V2 rejects blast minimum ratio outside (0,1]",
  () => {
    const raw =
      buildValidV2();

    raw.blast_min_damage_ratio =
      1.01;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_INVALID_GAME_RULES",
      }
    );
  }
);

test(
  "Rules V2 rejects self damage",
  () => {
    const raw =
      buildValidV2();

    raw.self_damage_enabled =
      true;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_INVALID_GAME_RULES",
      }
    );
  }
);

test(
  "unsupported rules versions fail closed",
  () => {
    const raw =
      buildValidV1();

    raw.version = 3;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_UNSUPPORTED_GAME_RULES_VERSION",
      }
    );
  }
);
