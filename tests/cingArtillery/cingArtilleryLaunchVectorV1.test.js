"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  LAUNCH_DIRECTION_VALUE_SCALE_V1,
  deriveLaunchVectorV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryLaunchVectorV1"
  );


function buildBase({
  angleDeg = 45,
  shooterX = 100,
  opponentX = 900,
} = {}) {
  return {
    angleDeg,

    angleMinDeg:
      0,

    angleMaxDeg:
      90,

    angleStepDeg:
      1,

    physicsFixedScale:
      1000,

    trigAlgorithmVersion:
      1,

    trigAngleScale:
      1000000000,

    trigValueScale:
      1000000000,

    shooterX,
    opponentX,
  };
}


test(
  "Launch Vector V1 direction scale is canonical Trig V1 value scale",
  () => {
    assert.equal(
      LAUNCH_DIRECTION_VALUE_SCALE_V1,
      1000000000n
    );
  }
);


test(
  "45 degree right-facing launch maps local CORDIC vector into world coordinates",
  () => {
    const result =
      deriveLaunchVectorV1(
        buildBase()
      );

    assert.deepEqual(
      result,
      {
        angle_deg_scaled:
          45000n,

        angle_trig_units:
          45000000000n,

        fire_direction:
          "right",

        fire_direction_x_sign:
          1n,

        direction_x_scaled:
          707106785n,

        direction_y_scaled:
          -707106779n,

        direction_value_scale:
          1000000000n,

        cordic_residual_angle_units:
          -6n,
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
  "45 degree left-facing launch mirrors X only",
  () => {
    const result =
      deriveLaunchVectorV1(
        buildBase({
          shooterX:
            900,

          opponentX:
            100,
        })
      );

    assert.equal(
      result.fire_direction,
      "left"
    );

    assert.equal(
      result.fire_direction_x_sign,
      -1n
    );

    assert.equal(
      result.direction_x_scaled,
      -707106785n
    );

    assert.equal(
      result.direction_y_scaled,
      -707106779n
    );
  }
);


test(
  "0 degree launch is exact horizontal cardinal in both directions",
  () => {
    const right =
      deriveLaunchVectorV1(
        buildBase({
          angleDeg:
            0,
        })
      );

    assert.equal(
      right.direction_x_scaled,
      1000000000n
    );

    assert.equal(
      right.direction_y_scaled,
      0n
    );


    const left =
      deriveLaunchVectorV1(
        buildBase({
          angleDeg:
            0,

          shooterX:
            900,

          opponentX:
            100,
        })
      );

    assert.equal(
      left.direction_x_scaled,
      -1000000000n
    );

    assert.equal(
      left.direction_y_scaled,
      0n
    );
  }
);


test(
  "90 degree launch is exact vertical upward independent of horizontal facing",
  () => {
    const right =
      deriveLaunchVectorV1(
        buildBase({
          angleDeg:
            90,
        })
      );

    const left =
      deriveLaunchVectorV1(
        buildBase({
          angleDeg:
            90,

          shooterX:
            900,

          opponentX:
            100,
        })
      );

    for (
      const result
      of [right, left]
    ) {
      assert.equal(
        result.direction_x_scaled,
        0n
      );

      assert.equal(
        result.direction_y_scaled,
        -1000000000n
      );

      assert.equal(
        result.cordic_residual_angle_units,
        0n
      );
    }
  }
);


test(
  "10 degree launch reproduces CORDIC golden vector with world Y inversion",
  () => {
    const result =
      deriveLaunchVectorV1(
        buildBase({
          angleDeg:
            10,
        })
      );

    assert.equal(
      result.direction_x_scaled,
      984807751n
    );

    assert.equal(
      result.direction_y_scaled,
      -173648178n
    );

    assert.equal(
      result.cordic_residual_angle_units,
      22n
    );
  }
);


test(
  "Launch Vector V1 rejects an off-grid shot angle",
  () => {
    assert.throws(
      () =>
        deriveLaunchVectorV1({
          ...buildBase({
            angleDeg:
              45.5,
          }),

          angleStepDeg:
            1,
        }),
      {
        code:
          "CING_ARTILLERY_SHOT_ANGLE_NOT_ON_GRID",
      }
    );
  }
);


test(
  "Launch Vector V1 preserves exact fractional angle grids",
  () => {
    const result =
      deriveLaunchVectorV1({
        ...buildBase({
          angleDeg:
            45.5,
        }),

        angleStepDeg:
          0.5,
      });

    assert.equal(
      result.angle_deg_scaled,
      45500n
    );

    assert.equal(
      result.angle_trig_units,
      45500000000n
    );

    assert.ok(
      result.direction_x_scaled >
        0n
    );

    assert.ok(
      result.direction_y_scaled <
        0n
    );
  }
);


test(
  "Launch Vector V1 rejects undefined horizontal facing",
  () => {
    assert.throws(
      () =>
        deriveLaunchVectorV1(
          buildBase({
            shooterX:
              500,

            opponentX:
              500,
          })
        ),
      {
        code:
          "CING_ARTILLERY_HORIZONTAL_FIRE_DIRECTION_UNDEFINED",
      }
    );
  }
);


test(
  "Launch Vector V1 rejects noncanonical trig algorithm identity",
  () => {
    assert.throws(
      () =>
        deriveLaunchVectorV1({
          ...buildBase(),

          trigAlgorithmVersion:
            2,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_TRIG_ALGORITHM_V1",
      }
    );

    assert.throws(
      () =>
        deriveLaunchVectorV1({
          ...buildBase(),

          trigAngleScale:
            1000000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_TRIG_ALGORITHM_V1",
      }
    );

    assert.throws(
      () =>
        deriveLaunchVectorV1({
          ...buildBase(),

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


test(
  "Launch Vector V1 rejects angles outside configured range",
  () => {
    assert.throws(
      () =>
        deriveLaunchVectorV1({
          ...buildBase({
            angleDeg:
              9,
          }),

          angleMinDeg:
            10,

          angleMaxDeg:
            80,
        }),
      {
        code:
          "CING_ARTILLERY_SHOT_ANGLE_OUT_OF_GRID_RANGE",
      }
    );
  }
);
