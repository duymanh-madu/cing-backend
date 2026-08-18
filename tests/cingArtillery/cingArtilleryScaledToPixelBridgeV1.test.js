"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  POSTGRES_INTEGER_MAX,

  scaledCoordinateToOwningPixelCellV1,
  projectScaledPointToMapPixelV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryScaledToPixelBridgeV1"
  );


test(
  "positive scaled coordinates map to canonical owning pixel cells",
  () => {
    const cases = [
      [0n, 0n],
      [1n, 0n],
      [999n, 0n],
      [1000n, 1n],
      [1999n, 1n],
      [2000n, 2n],
    ];

    for (
      const [
        coordinateScaled,
        expectedPixel,
      ] of cases
    ) {
      assert.equal(
        scaledCoordinateToOwningPixelCellV1({
          coordinateScaled,
          physicsFixedScale:
            1000,
        }),
        expectedPixel
      );
    }
  }
);


test(
  "negative scaled coordinates use mathematical floor cell ownership",
  () => {
    const cases = [
      [-1n, -1n],
      [-999n, -1n],
      [-1000n, -1n],
      [-1001n, -2n],
      [-1999n, -2n],
      [-2000n, -2n],
    ];

    for (
      const [
        coordinateScaled,
        expectedPixel,
      ] of cases
    ) {
      assert.equal(
        scaledCoordinateToOwningPixelCellV1({
          coordinateScaled,
          physicsFixedScale:
            1000,
        }),
        expectedPixel
      );
    }
  }
);


test(
  "negative fractional map position never truncates into pixel zero",
  () => {
    assert.equal(
      -1n /
        1000n,
      0n
    );

    assert.equal(
      scaledCoordinateToOwningPixelCellV1({
        coordinateScaled:
          -1n,

        physicsFixedScale:
          1000,
      }),
      -1n
    );
  }
);


test(
  "in-bounds point converts owning cells to safe Number pixels only after bounds check",
  () => {
    const result =
      projectScaledPointToMapPixelV1({
        xScaled:
          1999n,

        yScaled:
          2999n,

        physicsFixedScale:
          1000,

        widthPx:
          10,

        heightPx:
          10,
      });

    assert.deepEqual(
      result,
      {
        in_bounds:
          true,

        x_cell:
          1n,

        y_cell:
          2n,

        x_px:
          1,

        y_px:
          2,
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
  "exact right and bottom map boundaries are outside",
  () => {
    const right =
      projectScaledPointToMapPixelV1({
        xScaled:
          10000n,

        yScaled:
          0n,

        physicsFixedScale:
          1000,

        widthPx:
          10,

        heightPx:
          10,
      });

    assert.deepEqual(
      right,
      {
        in_bounds:
          false,

        x_cell:
          10n,

        y_cell:
          0n,

        x_px:
          null,

        y_px:
          null,
      }
    );


    const bottom =
      projectScaledPointToMapPixelV1({
        xScaled:
          0n,

        yScaled:
          10000n,

        physicsFixedScale:
          1000,

        widthPx:
          10,

        heightPx:
          10,
      });

    assert.equal(
      bottom.in_bounds,
      false
    );

    assert.equal(
      bottom.y_cell,
      10n
    );

    assert.equal(
      bottom.y_px,
      null
    );
  }
);


test(
  "negative subpixel coordinates remain outside map",
  () => {
    const result =
      projectScaledPointToMapPixelV1({
        xScaled:
          -1n,

        yScaled:
          500n,

        physicsFixedScale:
          1000,

        widthPx:
          10,

        heightPx:
          10,
      });

    assert.deepEqual(
      result,
      {
        in_bounds:
          false,

        x_cell:
          -1n,

        y_cell:
          0n,

        x_px:
          null,

        y_px:
          null,
      }
    );
  }
);


test(
  "arbitrarily distant BigInt coordinates are bounds-checked without Number projection",
  () => {
    const huge =
      10n **
      100n;

    const result =
      projectScaledPointToMapPixelV1({
        xScaled:
          huge,

        yScaled:
          -huge,

        physicsFixedScale:
          1000,

        widthPx:
          1920,

        heightPx:
          1080,
      });

    assert.equal(
      result.in_bounds,
      false
    );

    assert.equal(
      typeof result.x_cell,
      "bigint"
    );

    assert.equal(
      typeof result.y_cell,
      "bigint"
    );

    assert.equal(
      result.x_px,
      null
    );

    assert.equal(
      result.y_px,
      null
    );
  }
);


test(
  "last in-bounds PostgreSQL integer pixel projects exactly",
  () => {
    const scale =
      1;

    const result =
      projectScaledPointToMapPixelV1({
        xScaled:
          BigInt(
            POSTGRES_INTEGER_MAX -
            1
          ),

        yScaled:
          0n,

        physicsFixedScale:
          scale,

        widthPx:
          POSTGRES_INTEGER_MAX,

        heightPx:
          1,
      });

    assert.equal(
      result.in_bounds,
      true
    );

    assert.equal(
      result.x_px,
      POSTGRES_INTEGER_MAX -
        1
    );
  }
);


test(
  "invalid scaled coordinate types fail closed",
  () => {
    assert.throws(
      () =>
        scaledCoordinateToOwningPixelCellV1({
          coordinateScaled:
            1000,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SCALED_TO_PIXEL_BRIDGE_V1",
      }
    );
  }
);


test(
  "invalid physics fixed scale fails closed",
  () => {
    for (
      const physicsFixedScale of [
        0,
        -1,
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
      ]
    ) {
      assert.throws(
        () =>
          scaledCoordinateToOwningPixelCellV1({
            coordinateScaled:
              0n,

            physicsFixedScale,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_SCALED_TO_PIXEL_BRIDGE_V1",
        }
      );
    }
  }
);


test(
  "map dimensions must fit canonical PostgreSQL integer domain",
  () => {
    for (
      const [widthPx, heightPx] of [
        [0, 10],
        [10, 0],
        [-1, 10],
        [10, -1],
        [1.5, 10],
        [10, 1.5],
      ]
    ) {
      assert.throws(
        () =>
          projectScaledPointToMapPixelV1({
            xScaled:
              0n,

            yScaled:
              0n,

            physicsFixedScale:
              1000,

            widthPx,
            heightPx,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_SCALED_TO_PIXEL_BRIDGE_V1",
        }
      );
    }


    assert.throws(
      () =>
        projectScaledPointToMapPixelV1({
          xScaled:
            0n,

          yScaled:
            0n,

          physicsFixedScale:
            1000,

          widthPx:
            POSTGRES_INTEGER_MAX +
            1,

          heightPx:
            10,
        }),
      {
        code:
          "CING_ARTILLERY_SCALED_TO_PIXEL_MAP_DIMENSION_OUT_OF_RANGE",
      }
    );
  }
);
