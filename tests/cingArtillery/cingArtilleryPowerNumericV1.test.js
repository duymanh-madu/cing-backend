"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  normalizePowerRulesV1,
  normalizeShotPowerV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryPowerNumericV1"
  );


test(
  "integer power rules normalize exactly",
  () => {
    const result =
      normalizePowerRulesV1({
        powerMin:
          0,

        powerMax:
          100,

        powerVelocityScale:
          1,

        physicsFixedScale:
          1000,
      });

    assert.deepEqual(
      result,
      {
        power_min_scaled:
          0n,

        power_max_scaled:
          100000n,

        power_velocity_scale_scaled:
          1000n,
      }
    );

    assert.ok(
      Object.isFrozen(
        result
      )
    );
  }
);


test(
  "fractional power values normalize exactly when physics lattice supports them",
  () => {
    const result =
      normalizeShotPowerV1({
        power:
          45.5,

        powerMin:
          0,

        powerMax:
          100,

        powerVelocityScale:
          1.25,

        physicsFixedScale:
          1000,
      });

    assert.equal(
      result.power_scaled,
      45500n
    );

    assert.equal(
      result.power_velocity_scale_scaled,
      1250n
    );
  }
);


test(
  "shot power boundaries are canonical",
  () => {
    const minimum =
      normalizeShotPowerV1({
        power:
          0,

        powerMin:
          0,

        powerMax:
          100,

        powerVelocityScale:
          1,

        physicsFixedScale:
          1000,
      });

    const maximum =
      normalizeShotPowerV1({
        power:
          100,

        powerMin:
          0,

        powerMax:
          100,

        powerVelocityScale:
          1,

        physicsFixedScale:
          1000,
      });

    assert.equal(
      minimum.power_scaled,
      0n
    );

    assert.equal(
      maximum.power_scaled,
      100000n
    );
  }
);


test(
  "shot power outside configured range fails closed",
  () => {
    assert.throws(
      () =>
        normalizeShotPowerV1({
          power:
            100.001,

          powerMin:
            0,

          powerMax:
            100,

          powerVelocityScale:
            1,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_SHOT_POWER_OUT_OF_RANGE",
      }
    );
  }
);


test(
  "power outside physics lattice fails closed",
  () => {
    assert.throws(
      () =>
        normalizeShotPowerV1({
          power:
            45.0001,

          powerMin:
            0,

          powerMax:
            100,

          powerVelocityScale:
            1,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      }
    );
  }
);


test(
  "power_velocity_scale outside physics lattice fails closed",
  () => {
    assert.throws(
      () =>
        normalizePowerRulesV1({
          powerMin:
            0,

          powerMax:
            100,

          powerVelocityScale:
            1.0001,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      }
    );
  }
);


test(
  "negative power minimum fails closed",
  () => {
    assert.throws(
      () =>
        normalizePowerRulesV1({
          powerMin:
            -1,

          powerMax:
            100,

          powerVelocityScale:
            1,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_POWER_NUMERIC_V1",
      }
    );
  }
);


test(
  "power range inversion fails closed",
  () => {
    assert.throws(
      () =>
        normalizePowerRulesV1({
          powerMin:
            101,

          powerMax:
            100,

          powerVelocityScale:
            1,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_POWER_NUMERIC_V1",
      }
    );
  }
);


test(
  "non-positive power velocity scale fails closed",
  () => {
    assert.throws(
      () =>
        normalizePowerRulesV1({
          powerMin:
            0,

          powerMax:
            100,

          powerVelocityScale:
            0,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_POWER_NUMERIC_V1",
      }
    );
  }
);
