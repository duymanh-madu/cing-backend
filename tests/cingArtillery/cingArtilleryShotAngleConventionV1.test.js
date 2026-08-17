"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  CING_ARTILLERY_SHOT_ANGLE_CONVENTION_V1,
  assertShotAngleConventionV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryShotAngleConventionV1"
  );


test(
  "Shot Angle Convention V1 identity is frozen",
  () => {
    assert.ok(
      Object.isFrozen(
        CING_ARTILLERY_SHOT_ANGLE_CONVENTION_V1
      )
    );

    assert.deepEqual(
      CING_ARTILLERY_SHOT_ANGLE_CONVENTION_V1,
      {
        reference:
          "elevation_above_local_forward_horizontal",

        minimum_deg:
          0,

        maximum_deg:
          90,

        world_x_positive:
          "right",

        world_y_positive:
          "down",

        vertical_launch_sign:
          -1n,
      }
    );
  }
);


test(
  "canonical 10 to 80 degree gameplay range is accepted",
  () => {
    const result =
      assertShotAngleConventionV1({
        angleMinDegScaled:
          10000n,

        angleMaxDegScaled:
          80000n,

        physicsFixedScale:
          1000,
      });

    assert.equal(
      result.angle_min_deg_scaled,
      10000n
    );

    assert.equal(
      result.angle_max_deg_scaled,
      80000n
    );

    assert.equal(
      result.canonical_min_deg_scaled,
      0n
    );

    assert.equal(
      result.canonical_max_deg_scaled,
      90000n
    );

    assert.equal(
      result.vertical_launch_sign,
      -1n
    );
  }
);


test(
  "exact 0 to 90 degree semantic boundaries are accepted",
  () => {
    const result =
      assertShotAngleConventionV1({
        angleMinDegScaled:
          0n,

        angleMaxDegScaled:
          90000000000n,

        physicsFixedScale:
          1000000000,
      });

    assert.equal(
      result.canonical_min_deg_scaled,
      0n
    );

    assert.equal(
      result.canonical_max_deg_scaled,
      90000000000n
    );
  }
);


test(
  "negative elevation fails closed",
  () => {
    assert.throws(
      () =>
        assertShotAngleConventionV1({
          angleMinDegScaled:
            -1n,

          angleMaxDegScaled:
            80000n,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SHOT_ANGLE_CONVENTION_V1",
      }
    );
  }
);


test(
  "elevation above 90 degrees fails closed",
  () => {
    assert.throws(
      () =>
        assertShotAngleConventionV1({
          angleMinDegScaled:
            10000n,

          angleMaxDegScaled:
            90001n,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SHOT_ANGLE_CONVENTION_V1",
      }
    );
  }
);


test(
  "invalid canonical physics scale fails closed",
  () => {
    assert.throws(
      () =>
        assertShotAngleConventionV1({
          angleMinDegScaled:
            0n,

          angleMaxDegScaled:
            90n,

          physicsFixedScale:
            2147483648,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SHOT_ANGLE_CONVENTION_V1",
      }
    );
  }
);
