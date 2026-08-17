"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  TRIG_ALGORITHM_VERSION_V1,
  CORDIC_ITERATIONS_V1,

  TRIG_ANGLE_SCALE_V1,
  TRIG_VALUE_SCALE_V1,

  assertTrigAlgorithmV1Contract,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryTrigAlgorithmV1Contract"
  );


test(
  "Trig Algorithm V1 identity is frozen",
  () => {
    assert.equal(
      TRIG_ALGORITHM_VERSION_V1,
      1
    );

    assert.equal(
      CORDIC_ITERATIONS_V1,
      32
    );

    assert.equal(
      TRIG_ANGLE_SCALE_V1,
      1000000000
    );

    assert.equal(
      TRIG_VALUE_SCALE_V1,
      1000000000
    );
  }
);


test(
  "canonical V1 representation is accepted",
  () => {
    const contract =
      assertTrigAlgorithmV1Contract({
        trigAlgorithmVersion:
          1,

        trigAngleScale:
          1000000000,

        trigValueScale:
          1000000000,
      });

    assert.deepEqual(
      contract,
      {
        trig_algorithm_version:
          1,

        cordic_iterations:
          32,

        trig_angle_scale:
          1000000000,

        trig_value_scale:
          1000000000,
      }
    );

    assert.ok(
      Object.isFrozen(
        contract
      )
    );
  }
);


test(
  "unsupported trig algorithm version fails closed",
  () => {
    assert.throws(
      () =>
        assertTrigAlgorithmV1Contract({
          trigAlgorithmVersion:
            2,

          trigAngleScale:
            1000000000,

          trigValueScale:
            1000000000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_TRIG_ALGORITHM_V1",
      }
    );
  }
);


test(
  "noncanonical V1 angle scale fails closed",
  () => {
    assert.throws(
      () =>
        assertTrigAlgorithmV1Contract({
          trigAlgorithmVersion:
            1,

          trigAngleScale:
            1000000,

          trigValueScale:
            1000000000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_TRIG_ALGORITHM_V1",
      }
    );
  }
);


test(
  "noncanonical V1 output scale fails closed",
  () => {
    assert.throws(
      () =>
        assertTrigAlgorithmV1Contract({
          trigAlgorithmVersion:
            1,

          trigAngleScale:
            1000000000,

          trigValueScale:
            1000000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_TRIG_ALGORITHM_V1",
      }
    );
  }
);
