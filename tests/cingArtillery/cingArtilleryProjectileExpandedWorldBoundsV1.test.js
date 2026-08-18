"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  deriveProjectileExpandedWorldBoundsV1,
  pointInsideProjectileExpandedWorldV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryProjectileExpandedWorldBoundsV1"
  );


test(
  "derives exact radius-expanded closed center domain",
  () => {
    assert.deepEqual(
      deriveProjectileExpandedWorldBoundsV1({
        projectileRadiusScaled:
          100n,

        physicsFixedScale:
          1000,

        widthPx:
          8,

        heightPx:
          4,
      }),
      {
        min_x_scaled:
          -100n,

        min_y_scaled:
          -100n,

        max_x_scaled:
          8100n,

        max_y_scaled:
          4100n,

        world_width_scaled:
          8000n,

        world_height_scaled:
          4000n,

        projectile_radius_scaled:
          100n,

        physics_fixed_scale:
          1000n,
      }
    );
  }
);


test(
  "derived bounds are frozen",
  () => {
    const result =
      deriveProjectileExpandedWorldBoundsV1({
        projectileRadiusScaled:
          100n,

        physicsFixedScale:
          1000,

        widthPx:
          8,

        heightPx:
          4,
      });


    assert.ok(
      Object.isFrozen(
        result
      )
    );
  }
);


test(
  "closed expanded boundary remains inside",
  () => {
    const bounds =
      deriveProjectileExpandedWorldBoundsV1({
        projectileRadiusScaled:
          100n,

        physicsFixedScale:
          1000,

        widthPx:
          8,

        heightPx:
          4,
      });


    const boundaryPoints = [
      [-100n, 2000n],
      [8100n, 2000n],
      [2000n, -100n],
      [2000n, 4100n],
      [-100n, -100n],
      [8100n, 4100n],
    ];


    for (
      const [
        xScaled,
        yScaled,
      ]
      of boundaryPoints
    ) {
      assert.equal(
        pointInsideProjectileExpandedWorldV1({
          xScaled,
          yScaled,

          expandedWorldBounds:
            bounds,
        }),
        true
      );
    }
  }
);


test(
  "one lattice unit beyond each expanded boundary is outside",
  () => {
    const bounds =
      deriveProjectileExpandedWorldBoundsV1({
        projectileRadiusScaled:
          100n,

        physicsFixedScale:
          1000,

        widthPx:
          8,

        heightPx:
          4,
      });


    const outsidePoints = [
      [-101n, 2000n],
      [8101n, 2000n],
      [2000n, -101n],
      [2000n, 4101n],
    ];


    for (
      const [
        xScaled,
        yScaled,
      ]
      of outsidePoints
    ) {
      assert.equal(
        pointInsideProjectileExpandedWorldV1({
          xScaled,
          yScaled,

          expandedWorldBounds:
            bounds,
        }),
        false
      );
    }
  }
);


test(
  "center outside raw map can remain inside expanded world",
  () => {
    const bounds =
      deriveProjectileExpandedWorldBoundsV1({
        projectileRadiusScaled:
          100n,

        physicsFixedScale:
          1000,

        widthPx:
          8,

        heightPx:
          4,
      });


    assert.equal(
      pointInsideProjectileExpandedWorldV1({
        xScaled:
          8050n,

        yScaled:
          2000n,

        expandedWorldBounds:
          bounds,
      }),
      true
    );
  }
);


test(
  "larger radius expands canonical center domain exactly",
  () => {
    const result =
      deriveProjectileExpandedWorldBoundsV1({
        projectileRadiusScaled:
          500n,

        physicsFixedScale:
          1000,

        widthPx:
          8,

        heightPx:
          4,
      });


    assert.equal(
      result.min_x_scaled,
      -500n
    );

    assert.equal(
      result.max_x_scaled,
      8500n
    );

    assert.equal(
      result.min_y_scaled,
      -500n
    );

    assert.equal(
      result.max_y_scaled,
      4500n
    );
  }
);


test(
  "invalid radius scale and dimensions fail closed",
  () => {
    assert.throws(
      () =>
        deriveProjectileExpandedWorldBoundsV1({
          projectileRadiusScaled:
            0n,

          physicsFixedScale:
            1000,

          widthPx:
            8,

          heightPx:
            4,
        })
    );

    assert.throws(
      () =>
        deriveProjectileExpandedWorldBoundsV1({
          projectileRadiusScaled:
            100n,

          physicsFixedScale:
            0,

          widthPx:
            8,

          heightPx:
            4,
        })
    );

    assert.throws(
      () =>
        deriveProjectileExpandedWorldBoundsV1({
          projectileRadiusScaled:
            100n,

          physicsFixedScale:
            1000,

          widthPx:
            0,

          heightPx:
            4,
        })
    );
  }
);


test(
  "point-membership coordinates must remain BigInt",
  () => {
    const bounds =
      deriveProjectileExpandedWorldBoundsV1({
        projectileRadiusScaled:
          100n,

        physicsFixedScale:
          1000,

        widthPx:
          8,

        heightPx:
          4,
      });


    assert.throws(
      () =>
        pointInsideProjectileExpandedWorldV1({
          xScaled:
            0,

          yScaled:
            0n,

          expandedWorldBounds:
            bounds,
        })
    );
  }
);
