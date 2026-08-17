"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  deriveInitialVelocityV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryInitialVelocityV1"
  );


function base({
  power = 100,
  directionXScaled = 707106785n,
  directionYScaled = -707106779n,
} = {}) {
  return {
    power,

    powerMin:
      0,

    powerMax:
      100,

    powerVelocityScale:
      1,

    physicsFixedScale:
      1000,

    directionXScaled,
    directionYScaled,

    directionValueScale:
      1000000000n,
  };
}


test(
  "100 power with scale 1 produces speed 100 on physics lattice",
  () => {
    const result =
      deriveInitialVelocityV1(
        base()
      );

    assert.equal(
      result.power_scaled,
      100000n
    );

    assert.equal(
      result.power_velocity_scale_scaled,
      1000n
    );

    assert.equal(
      result.speed_scaled,
      100000n
    );

    assert.equal(
      result.physics_fixed_scale,
      1000n
    );

    assert.ok(
      Object.isFrozen(
        result
      )
    );
  }
);


test(
  "45 degree right-facing velocity uses magnitude-first floor",
  () => {
    const result =
      deriveInitialVelocityV1(
        base()
      );

    assert.equal(
      result.vx_scaled,
      70710n
    );

    assert.equal(
      result.vy_scaled,
      -70710n
    );
  }
);


test(
  "45 degree left-facing velocity is exact X mirror",
  () => {
    const right =
      deriveInitialVelocityV1(
        base()
      );

    const left =
      deriveInitialVelocityV1(
        base({
          directionXScaled:
            -707106785n,
        })
      );

    assert.equal(
      left.vx_scaled,
      -right.vx_scaled
    );

    assert.equal(
      left.vy_scaled,
      right.vy_scaled
    );
  }
);


test(
  "magnitude-first rounding prevents signed-floor asymmetry",
  () => {
    const right =
      deriveInitialVelocityV1({
        power:
          1,

        powerMin:
          0,

        powerMax:
          100,

        powerVelocityScale:
          1,

        physicsFixedScale:
          10,

        directionXScaled:
          333333333n,

        directionYScaled:
          -333333333n,

        directionValueScale:
          1000000000n,
      });

    const left =
      deriveInitialVelocityV1({
        power:
          1,

        powerMin:
          0,

        powerMax:
          100,

        powerVelocityScale:
          1,

        physicsFixedScale:
          10,

        directionXScaled:
          -333333333n,

        directionYScaled:
          -333333333n,

        directionValueScale:
          1000000000n,
      });

    assert.equal(
      right.vx_scaled,
      3n
    );

    assert.equal(
      left.vx_scaled,
      -3n
    );

    assert.equal(
      right.vy_scaled,
      -3n
    );

    assert.equal(
      left.vy_scaled,
      -3n
    );
  }
);


test(
  "zero power produces exact zero velocity",
  () => {
    const result =
      deriveInitialVelocityV1(
        base({
          power:
            0,
        })
      );

    assert.equal(
      result.speed_scaled,
      0n
    );

    assert.equal(
      result.vx_scaled,
      0n
    );

    assert.equal(
      result.vy_scaled,
      0n
    );
  }
);


test(
  "horizontal cardinal preserves exact scalar speed",
  () => {
    const right =
      deriveInitialVelocityV1(
        base({
          directionXScaled:
            1000000000n,

          directionYScaled:
            0n,
        })
      );

    const left =
      deriveInitialVelocityV1(
        base({
          directionXScaled:
            -1000000000n,

          directionYScaled:
            0n,
        })
      );

    assert.equal(
      right.vx_scaled,
      100000n
    );

    assert.equal(
      right.vy_scaled,
      0n
    );

    assert.equal(
      left.vx_scaled,
      -100000n
    );

    assert.equal(
      left.vy_scaled,
      0n
    );
  }
);


test(
  "vertical cardinal preserves exact scalar speed upward",
  () => {
    const result =
      deriveInitialVelocityV1(
        base({
          directionXScaled:
            0n,

          directionYScaled:
            -1000000000n,
        })
      );

    assert.equal(
      result.vx_scaled,
      0n
    );

    assert.equal(
      result.vy_scaled,
      -100000n
    );
  }
);


test(
  "fractional power and velocity scale remain exact on physics lattice",
  () => {
    const result =
      deriveInitialVelocityV1({
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

        directionXScaled:
          1000000000n,

        directionYScaled:
          0n,

        directionValueScale:
          1000000000n,
      });

    assert.equal(
      result.power_scaled,
      45500n
    );

    assert.equal(
      result.power_velocity_scale_scaled,
      1250n
    );

    assert.equal(
      result.speed_scaled,
      56875n
    );

    assert.equal(
      result.vx_scaled,
      56875n
    );
  }
);


test(
  "shot power outside physics lattice fails closed",
  () => {
    assert.throws(
      () =>
        deriveInitialVelocityV1({
          ...base(),

          power:
            45.0001,
        }),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      }
    );
  }
);


test(
  "direction component outside normalized scale fails closed",
  () => {
    assert.throws(
      () =>
        deriveInitialVelocityV1({
          ...base(),

          directionXScaled:
            1000000001n,
        }),
      {
        code:
          "CING_ARTILLERY_INITIAL_VELOCITY_DIRECTION_OUT_OF_RANGE",
      }
    );

    assert.throws(
      () =>
        deriveInitialVelocityV1({
          ...base(),

          directionYScaled:
            -1000000001n,
        }),
      {
        code:
          "CING_ARTILLERY_INITIAL_VELOCITY_DIRECTION_OUT_OF_RANGE",
      }
    );
  }
);


test(
  "direction value scale must be positive BigInt",
  () => {
    assert.throws(
      () =>
        deriveInitialVelocityV1({
          ...base(),

          directionValueScale:
            0n,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_INITIAL_VELOCITY_V1",
      }
    );

    assert.throws(
      () =>
        deriveInitialVelocityV1({
          ...base(),

          directionValueScale:
            1000000000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_INITIAL_VELOCITY_V1",
      }
    );
  }
);
