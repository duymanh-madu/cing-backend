"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  derivePlayerColliderV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryPlayerColliderV1"
  );


test(
  "ground-contact spawn derives canonical collider center above spawn",
  () => {
    const result =
      derivePlayerColliderV1({
        spawnX:
          100,

        spawnY:
          200,

        physicsFixedScale:
          1000,

        playerHitRadiusScaled:
          2000n,

        playerHitCenterOffsetYScaled:
          1000n,
      });

    assert.deepEqual(
      result,
      {
        spawn_x_scaled:
          100000n,

        spawn_y_scaled:
          200000n,

        center_x_scaled:
          100000n,

        center_y_scaled:
          199000n,

        radius_scaled:
          2000n,
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
  "horizontal collider center remains exactly aligned with ground-contact spawn",
  () => {
    const result =
      derivePlayerColliderV1({
        spawnX:
          321,

        spawnY:
          654,

        physicsFixedScale:
          1000,

        playerHitRadiusScaled:
          2500n,

        playerHitCenterOffsetYScaled:
          1750n,
      });

    assert.equal(
      result.center_x_scaled,
      result.spawn_x_scaled
    );

    assert.equal(
      result.center_x_scaled,
      321000n
    );
  }
);


test(
  "fractional canonical center offset remains exact in scaled space",
  () => {
    const result =
      derivePlayerColliderV1({
        spawnX:
          10,

        spawnY:
          20,

        physicsFixedScale:
          1000,

        playerHitRadiusScaled:
          2500n,

        playerHitCenterOffsetYScaled:
          1750n,
      });

    assert.equal(
      result.spawn_y_scaled,
      20000n
    );

    assert.equal(
      result.center_y_scaled,
      18250n
    );
  }
);


test(
  "subpixel center offset is preserved without pixel quantization",
  () => {
    const result =
      derivePlayerColliderV1({
        spawnX:
          0,

        spawnY:
          1,

        physicsFixedScale:
          1000,

        playerHitRadiusScaled:
          750n,

        playerHitCenterOffsetYScaled:
          500n,
      });

    assert.equal(
      result.center_x_scaled,
      0n
    );

    assert.equal(
      result.center_y_scaled,
      500n
    );

    assert.equal(
      result.radius_scaled,
      750n
    );
  }
);


test(
  "collider center may be negative above top map boundary",
  () => {
    const result =
      derivePlayerColliderV1({
        spawnX:
          50,

        spawnY:
          0,

        physicsFixedScale:
          1000,

        playerHitRadiusScaled:
          2000n,

        playerHitCenterOffsetYScaled:
          1000n,
      });

    assert.equal(
      result.spawn_y_scaled,
      0n
    );

    assert.equal(
      result.center_y_scaled,
      -1000n
    );
  }
);


test(
  "maximum PostgreSQL spawn coordinate scales exactly with BigInt",
  () => {
    const max =
      2147483647;

    const result =
      derivePlayerColliderV1({
        spawnX:
          max,

        spawnY:
          max,

        physicsFixedScale:
          max,

        playerHitRadiusScaled:
          1n,

        playerHitCenterOffsetYScaled:
          1n,
      });

    const expected =
      BigInt(max) *
      BigInt(max);

    assert.equal(
      result.spawn_x_scaled,
      expected
    );

    assert.equal(
      result.spawn_y_scaled,
      expected
    );

    assert.equal(
      result.center_y_scaled,
      expected - 1n
    );
  }
);


test(
  "spawn coordinates must remain canonical PostgreSQL non-negative integers",
  () => {
    const invalid = [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2147483648,
      "1",
      1n,
      null,
    ];

    for (
      const spawnX
      of invalid
    ) {
      assert.throws(
        () =>
          derivePlayerColliderV1({
            spawnX,
            spawnY:
              10,

            physicsFixedScale:
              1000,

            playerHitRadiusScaled:
              2000n,

            playerHitCenterOffsetYScaled:
              1000n,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_PLAYER_COLLIDER_V1",
        }
      );
    }


    for (
      const spawnY
      of invalid
    ) {
      assert.throws(
        () =>
          derivePlayerColliderV1({
            spawnX:
              10,

            spawnY,

            physicsFixedScale:
              1000,

            playerHitRadiusScaled:
              2000n,

            playerHitCenterOffsetYScaled:
              1000n,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_PLAYER_COLLIDER_V1",
        }
      );
    }
  }
);


test(
  "physics fixed scale must be a positive PostgreSQL integer",
  () => {
    const invalid = [
      0,
      -1,
      1.5,
      2147483648,
      "1000",
      1000n,
      null,
    ];

    for (
      const physicsFixedScale
      of invalid
    ) {
      assert.throws(
        () =>
          derivePlayerColliderV1({
            spawnX:
              10,

            spawnY:
              20,

            physicsFixedScale,

            playerHitRadiusScaled:
              2000n,

            playerHitCenterOffsetYScaled:
              1000n,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_PLAYER_COLLIDER_V1",
        }
      );
    }
  }
);


test(
  "radius and center offset must already be canonical positive scaled BigInts",
  () => {
    const invalid = [
      0n,
      -1n,
      1,
      "1000",
      null,
    ];

    for (
      const playerHitRadiusScaled
      of invalid
    ) {
      assert.throws(
        () =>
          derivePlayerColliderV1({
            spawnX:
              10,

            spawnY:
              20,

            physicsFixedScale:
              1000,

            playerHitRadiusScaled,

            playerHitCenterOffsetYScaled:
              1000n,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_PLAYER_COLLIDER_V1",
        }
      );
    }


    for (
      const playerHitCenterOffsetYScaled
      of invalid
    ) {
      assert.throws(
        () =>
          derivePlayerColliderV1({
            spawnX:
              10,

            spawnY:
              20,

            physicsFixedScale:
              1000,

            playerHitRadiusScaled:
              2000n,

            playerHitCenterOffsetYScaled,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_PLAYER_COLLIDER_V1",
        }
      );
    }
  }
);
