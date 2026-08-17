"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  deriveMuzzleOriginV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryMuzzleOriginV1"
  );


function base(
  overrides = {}
) {
  return {
    shooterX:
      100,

    shooterY:
      200,

    opponentX:
      500,

    muzzleOffsetForwardPx:
      3,

    muzzleOffsetUpPx:
      7,

    physicsFixedScale:
      1000,

    ...overrides,
  };
}


test(
  "right-facing muzzle origin uses ground-contact spawn anchor",
  () => {
    const result =
      deriveMuzzleOriginV1(
        base()
      );

    assert.equal(
      result.spawn_x_scaled,
      100000n
    );

    assert.equal(
      result.spawn_y_scaled,
      200000n
    );

    assert.equal(
      result.fire_direction_x_sign,
      1n
    );

    assert.equal(
      result.origin_x_scaled,
      103000n
    );

    assert.equal(
      result.origin_y_scaled,
      193000n
    );

    assert.ok(
      Object.isFrozen(
        result
      )
    );
  }
);


test(
  "left-facing muzzle origin mirrors forward offset",
  () => {
    const result =
      deriveMuzzleOriginV1(
        base({
          shooterX:
            500,

          opponentX:
            100,
        })
      );

    assert.equal(
      result.fire_direction_x_sign,
      -1n
    );

    assert.equal(
      result.origin_x_scaled,
      497000n
    );

    assert.equal(
      result.origin_y_scaled,
      193000n
    );
  }
);


test(
  "zero forward offset preserves spawn X",
  () => {
    const right =
      deriveMuzzleOriginV1(
        base({
          muzzleOffsetForwardPx:
            0,
        })
      );

    const left =
      deriveMuzzleOriginV1(
        base({
          shooterX:
            500,

          opponentX:
            100,

          muzzleOffsetForwardPx:
            0,
        })
      );

    assert.equal(
      right.origin_x_scaled,
      right.spawn_x_scaled
    );

    assert.equal(
      left.origin_x_scaled,
      left.spawn_x_scaled
    );
  }
);


test(
  "fractional muzzle offsets remain exact on physics lattice",
  () => {
    const result =
      deriveMuzzleOriginV1(
        base({
          muzzleOffsetForwardPx:
            2.5,

          muzzleOffsetUpPx:
            7.25,
        })
      );

    assert.equal(
      result.muzzle_offset_forward_scaled,
      2500n
    );

    assert.equal(
      result.muzzle_offset_up_scaled,
      7250n
    );

    assert.equal(
      result.origin_x_scaled,
      102500n
    );

    assert.equal(
      result.origin_y_scaled,
      192750n
    );
  }
);


test(
  "undefined horizontal facing fails closed",
  () => {
    assert.throws(
      () =>
        deriveMuzzleOriginV1(
          base({
            opponentX:
              100,
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
  "upward offset placing origin above canonical world fails closed",
  () => {
    assert.throws(
      () =>
        deriveMuzzleOriginV1(
          base({
            shooterY:
              2,

            muzzleOffsetUpPx:
              3,
          })
        ),
      {
        code:
          "CING_ARTILLERY_MUZZLE_ORIGIN_NEGATIVE",
      }
    );
  }
);


test(
  "leftward forward offset placing origin outside canonical world fails closed",
  () => {
    assert.throws(
      () =>
        deriveMuzzleOriginV1({
          shooterX:
            2,

          shooterY:
            100,

          opponentX:
            0,

          muzzleOffsetForwardPx:
            3,

          muzzleOffsetUpPx:
            1,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_MUZZLE_ORIGIN_NEGATIVE",
      }
    );
  }
);


test(
  "muzzle offsets outside physics lattice fail closed",
  () => {
    assert.throws(
      () =>
        deriveMuzzleOriginV1(
          base({
            muzzleOffsetForwardPx:
              3.0001,
          })
        ),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      }
    );

    assert.throws(
      () =>
        deriveMuzzleOriginV1(
          base({
            muzzleOffsetUpPx:
              7.0001,
          })
        ),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      }
    );
  }
);


test(
  "invalid coordinates fail closed",
  () => {
    assert.throws(
      () =>
        deriveMuzzleOriginV1(
          base({
            shooterX:
              -1,
          })
        ),
      {
        code:
          "CING_ARTILLERY_INVALID_MUZZLE_ORIGIN_V1",
      }
    );

    assert.throws(
      () =>
        deriveMuzzleOriginV1(
          base({
            shooterY:
              1.5,
          })
        ),
      {
        code:
          "CING_ARTILLERY_INVALID_MUZZLE_ORIGIN_V1",
      }
    );
  }
);
