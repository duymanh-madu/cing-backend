"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  normalizeAccelerationRulesV1,
  normalizePersistedWindV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryAccelerationNumericV1"
  );


test(
  "integer gravity and wind range normalize exactly",
  () => {
    const result =
      normalizeAccelerationRulesV1({
        gravity:
          980,

        windMin:
          -100,

        windMax:
          100,

        physicsFixedScale:
          1000,
      });

    assert.deepEqual(
      result,
      {
        gravity_scaled:
          980000n,

        wind_min_scaled:
          -100000n,

        wind_max_scaled:
          100000n,
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
  "fractional gravity and wind normalize when exactly on lattice",
  () => {
    const result =
      normalizeAccelerationRulesV1({
        gravity:
          9.75,

        windMin:
          -12.5,

        windMax:
          12.5,

        physicsFixedScale:
          1000,
      });

    assert.equal(
      result.gravity_scaled,
      9750n
    );

    assert.equal(
      result.wind_min_scaled,
      -12500n
    );

    assert.equal(
      result.wind_max_scaled,
      12500n
    );
  }
);


test(
  "gravity outside physics lattice fails closed",
  () => {
    assert.throws(
      () =>
        normalizeAccelerationRulesV1({
          gravity:
            9.0001,

          windMin:
            -1,

          windMax:
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
  "wind bounds outside physics lattice fail closed",
  () => {
    assert.throws(
      () =>
        normalizeAccelerationRulesV1({
          gravity:
            1,

          windMin:
            -1.0001,

          windMax:
            1,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      }
    );

    assert.throws(
      () =>
        normalizeAccelerationRulesV1({
          gravity:
            1,

          windMin:
            -1,

          windMax:
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
  "gravity must remain positive",
  () => {
    assert.throws(
      () =>
        normalizeAccelerationRulesV1({
          gravity:
            0,

          windMin:
            -1,

          windMax:
            1,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_ACCELERATION_NUMERIC_V1",
      }
    );
  }
);


test(
  "wind range inversion fails closed",
  () => {
    assert.throws(
      () =>
        normalizeAccelerationRulesV1({
          gravity:
            1,

          windMin:
            2,

          windMax:
            -2,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_ACCELERATION_NUMERIC_V1",
      }
    );
  }
);


test(
  "persisted wind on lattice and inside range is canonical",
  () => {
    const result =
      normalizePersistedWindV1({
        initialWind:
          12.5,

        windMin:
          -100,

        windMax:
          100,

        physicsFixedScale:
          1000,
      });

    assert.equal(
      result.initial_wind_scaled,
      12500n
    );
  }
);


test(
  "persisted wind outside lattice fails closed",
  () => {
    assert.throws(
      () =>
        normalizePersistedWindV1({
          initialWind:
            0.123456789,

          windMin:
            -100,

          windMax:
            100,

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
  "persisted wind outside configured range fails closed",
  () => {
    assert.throws(
      () =>
        normalizePersistedWindV1({
          initialWind:
            101,

          windMin:
            -100,

          windMax:
            100,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_INITIAL_WIND_OUT_OF_RANGE",
      }
    );
  }
);
