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
    angle_step_deg: 1,

    power_min: 0,
    power_max: 100,
    power_velocity_scale: 1,

    physics_step_ms: 10,
    max_flight_time_ms: 1000,
    physics_fixed_scale: 1000,

    trig_algorithm_version: 1,
    trig_angle_scale: 1000000000,
    trig_value_scale: 1000000000,

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


test(
  "Rules V2 rejects angle range not divisible by angle step",
  () => {
    const raw =
      buildValidV2();

    raw.angle_step_deg =
      3;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_ANGLE_GRID_RANGE_MISALIGNED",
      }
    );
  }
);


test(
  "Rules V2 rejects angle step outside physics fixed lattice",
  () => {
    const raw =
      buildValidV2();

    raw.angle_step_deg =
      0.0001;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      }
    );
  }
);


test(
  "Rules V2 rejects angle grid not exactly representable on trig angle lattice",
  () => {
    const raw =
      buildValidV2();

    /*
     * physics scale 3 allows canonical 1/3 degree lattice.
     * trig angle scale 1,000,000 cannot represent 1/3 degree
     * exactly.
     */
    raw.physics_fixed_scale =
      3;

    raw.angle_min_deg =
      0;

    raw.angle_max_deg =
      1;

    raw.angle_step_deg =
      1 / 3;

    raw.trig_angle_scale =
      1000000;

    assert.throws(
      () =>
        normalizeGameRules(raw)
    );
  }
);


test(
  "Rules V2 rejects invalid trig angle scale",
  () => {
    const raw =
      buildValidV2();

    raw.trig_angle_scale =
      0;

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
  "Rules V2 rejects invalid trig value scale",
  () => {
    const raw =
      buildValidV2();

    raw.trig_value_scale =
      0;

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
  "Rules V2 rejects unsupported trig algorithm version",
  () => {
    const raw =
      buildValidV2();

    raw.trig_algorithm_version =
      2;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_INVALID_TRIG_ALGORITHM_V1",
      }
    );
  }
);


test(
  "Rules V2 rejects noncanonical Trig V1 angle scale",
  () => {
    const raw =
      buildValidV2();

    raw.trig_angle_scale =
      1000000;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_INVALID_TRIG_ALGORITHM_V1",
      }
    );
  }
);


test(
  "Rules V2 rejects noncanonical Trig V1 value scale",
  () => {
    const raw =
      buildValidV2();

    raw.trig_value_scale =
      1000000;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_INVALID_TRIG_ALGORITHM_V1",
      }
    );
  }
);


test(
  "Rules V2 rejects negative shot elevation",
  () => {
    const raw =
      buildValidV2();

    raw.angle_min_deg =
      -1;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_INVALID_SHOT_ANGLE_CONVENTION_V1",
      }
    );
  }
);


test(
  "Rules V2 rejects shot elevation above 90 degrees",
  () => {
    const raw =
      buildValidV2();

    raw.angle_max_deg =
      91;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_INVALID_SHOT_ANGLE_CONVENTION_V1",
      }
    );
  }
);


test(
  "Rules V2 rejects power minimum outside physics fixed lattice",
  () => {
    const raw =
      buildValidV2();

    raw.power_min =
      0.0001;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      }
    );
  }
);


test(
  "Rules V2 rejects power maximum outside physics fixed lattice",
  () => {
    const raw =
      buildValidV2();

    raw.power_max =
      99.9999;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      }
    );
  }
);


test(
  "Rules V2 rejects power velocity scale outside physics fixed lattice",
  () => {
    const raw =
      buildValidV2();

    raw.power_velocity_scale =
      1.0001;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      }
    );
  }
);


test(
  "Rules V2 rejects muzzle forward offset outside physics fixed lattice",
  () => {
    const raw =
      buildValidV2();

    raw.muzzle_offset_forward_px =
      0.0001;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      }
    );
  }
);


test(
  "Rules V2 rejects muzzle upward offset outside physics fixed lattice",
  () => {
    const raw =
      buildValidV2();

    raw.muzzle_offset_up_px =
      1.0001;

    assert.throws(
      () =>
        normalizeGameRules(raw),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      }
    );
  }
);
