"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  normalizeTrigRepresentationV1,
  convertPhysicsAngleToTrigUnitsV1,
  assertAngleGridFitsTrigRepresentationV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryTrigRepresentationV1"
  );


test(
  "representation keeps angle and trig output scales independent",
  () => {
    const normalized =
      normalizeTrigRepresentationV1({
        physicsFixedScale:
          1000,

        trigAngleScale:
          1000000,

        trigValueScale:
          1000000000,
      });

    assert.deepEqual(
      normalized,
      {
        physics_fixed_scale:
          1000,

        trig_angle_scale:
          1000000,

        trig_value_scale:
          1000000000,
      }
    );
  }
);


test(
  "integer-degree canonical angle converts exactly",
  () => {
    const value =
      convertPhysicsAngleToTrigUnitsV1({
        angleDegScaled:
          45000n,

        physicsFixedScale:
          1000,

        trigAngleScale:
          1000000,
      });

    assert.equal(
      value,
      45000000n
    );
  }
);


test(
  "fractional canonical angle converts exactly",
  () => {
    const value =
      convertPhysicsAngleToTrigUnitsV1({
        angleDegScaled:
          45500n,

        physicsFixedScale:
          1000,

        trigAngleScale:
          1000000,
      });

    assert.equal(
      value,
      45500000n
    );
  }
);


test(
  "conversion works with non-decimal physics scale when exact",
  () => {
    const value =
      convertPhysicsAngleToTrigUnitsV1({
        angleDegScaled:
          3n,

        physicsFixedScale:
          6,

        trigAngleScale:
          1000000,
      });

    assert.equal(
      value,
      500000n
    );
  }
);


test(
  "conversion fails closed when trig lattice cannot represent canonical angle",
  () => {
    assert.throws(
      () =>
        convertPhysicsAngleToTrigUnitsV1({
          angleDegScaled:
            1n,

          physicsFixedScale:
            3,

          trigAngleScale:
            1000000,
        }),
      {
        code:
          "CING_ARTILLERY_TRIG_ANGLE_QUANTIZATION_ERROR",
      }
    );
  }
);


test(
  "entire angle grid can be proven representable from min max and step",
  () => {
    const grid =
      assertAngleGridFitsTrigRepresentationV1({
        angleMinDegScaled:
          10000n,

        angleMaxDegScaled:
          80000n,

        angleStepDegScaled:
          500n,

        physicsFixedScale:
          1000,

        trigAngleScale:
          1000000,
      });

    assert.deepEqual(
      grid,
      {
        angle_min_trig_units:
          10000000n,

        angle_max_trig_units:
          80000000n,

        angle_step_trig_units:
          500000n,
      }
    );
  }
);


test(
  "angle grid fails closed when its step cannot map exactly",
  () => {
    assert.throws(
      () =>
        assertAngleGridFitsTrigRepresentationV1({
          angleMinDegScaled:
            0n,

          angleMaxDegScaled:
            2n,

          angleStepDegScaled:
            1n,

          physicsFixedScale:
            3,

          trigAngleScale:
            1000000,
        }),
      {
        code:
          "CING_ARTILLERY_TRIG_ANGLE_QUANTIZATION_ERROR",
      }
    );
  }
);


test(
  "invalid scales fail closed",
  () => {
    assert.throws(
      () =>
        normalizeTrigRepresentationV1({
          physicsFixedScale:
            1000,

          trigAngleScale:
            0,

          trigValueScale:
            1000000000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_TRIG_REPRESENTATION",
      }
    );
  }
);
