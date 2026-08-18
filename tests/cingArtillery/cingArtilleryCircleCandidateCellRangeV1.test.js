"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  deriveAxisCandidateCellRangeV1,
  deriveCircleCandidateCellRangeV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryCircleCandidateCellRangeV1"
  );


test(
  "circle fully inside one pixel still includes neighboring cells touched by radius only when required",
  () => {
    const result =
      deriveAxisCandidateCellRangeV1({
        centerScaled:
          1500n,

        radiusScaled:
          100n,

        physicsFixedScale:
          1000,
      });

    assert.deepEqual(
      result,
      {
        min_cell:
          1n,

        max_cell:
          1n,
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
  "exact lower integer boundary includes previous closed cell",
  () => {
    const result =
      deriveAxisCandidateCellRangeV1({
        centerScaled:
          1250n,

        radiusScaled:
          250n,

        physicsFixedScale:
          1000,
      });

    assert.deepEqual(
      result,
      {
        min_cell:
          0n,

        max_cell:
          1n,
      }
    );
  }
);


test(
  "one scaled unit above lower integer boundary excludes previous cell",
  () => {
    const result =
      deriveAxisCandidateCellRangeV1({
        centerScaled:
          1251n,

        radiusScaled:
          250n,

        physicsFixedScale:
          1000,
      });

    assert.equal(
      result.min_cell,
      1n
    );
  }
);


test(
  "exact upper integer boundary includes next closed cell",
  () => {
    const result =
      deriveAxisCandidateCellRangeV1({
        centerScaled:
          1750n,

        radiusScaled:
          250n,

        physicsFixedScale:
          1000,
      });

    assert.deepEqual(
      result,
      {
        min_cell:
          1n,

        max_cell:
          2n,
      }
    );
  }
);


test(
  "lower and upper exact boundaries include both outer tangent cells",
  () => {
    const result =
      deriveAxisCandidateCellRangeV1({
        centerScaled:
          1500n,

        radiusScaled:
          500n,

        physicsFixedScale:
          1000,
      });

    assert.deepEqual(
      result,
      {
        min_cell:
          0n,

        max_cell:
          2n,
      }
    );
  }
);


test(
  "negative exact boundary uses mathematical floor and includes previous closed cell",
  () => {
    const result =
      deriveAxisCandidateCellRangeV1({
        centerScaled:
          -750n,

        radiusScaled:
          250n,

        physicsFixedScale:
          1000,
      });

    /*
     * low  = -1000
     * high = -500
     *
     * cell -2 ends exactly at -1000
     * and must remain a candidate.
     */
    assert.deepEqual(
      result,
      {
        min_cell:
          -2n,

        max_cell:
          -1n,
      }
    );
  }
);


test(
  "negative subpixel range never truncates toward zero",
  () => {
    const result =
      deriveAxisCandidateCellRangeV1({
        centerScaled:
          -500n,

        radiusScaled:
          100n,

        physicsFixedScale:
          1000,
      });

    assert.deepEqual(
      result,
      {
        min_cell:
          -1n,

        max_cell:
          -1n,
      }
    );
  }
);


test(
  "circle range derives both axes independently",
  () => {
    const result =
      deriveCircleCandidateCellRangeV1({
        centerXScaled:
          1500n,

        centerYScaled:
          2750n,

        radiusScaled:
          500n,

        physicsFixedScale:
          1000,
      });

    assert.deepEqual(
      result,
      {
        min_x_cell:
          0n,

        max_x_cell:
          2n,

        min_y_cell:
          2n,

        max_y_cell:
          3n,
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
  "subpixel radius preserves exact fixed-lattice broad phase",
  () => {
    const result =
      deriveCircleCandidateCellRangeV1({
        centerXScaled:
          1000n,

        centerYScaled:
          1000n,

        radiusScaled:
          1n,

        physicsFixedScale:
          1000,
      });

    assert.deepEqual(
      result,
      {
        min_x_cell:
          0n,

        max_x_cell:
          1n,

        min_y_cell:
          0n,

        max_y_cell:
          1n,
      }
    );
  }
);


test(
  "arbitrarily large coordinates remain exact BigInt",
  () => {
    const huge =
      10n ** 100n;

    const result =
      deriveAxisCandidateCellRangeV1({
        centerScaled:
          huge * 1000n,

        radiusScaled:
          1000n,

        physicsFixedScale:
          1000,
      });

    assert.equal(
      result.min_cell,
      huge - 2n
    );

    assert.equal(
      result.max_cell,
      huge + 1n
    );
  }
);


test(
  "coordinates must be canonical BigInts",
  () => {
    for (
      const centerScaled
      of [
        1,
        "1",
        null,
        undefined,
      ]
    ) {
      assert.throws(
        () =>
          deriveAxisCandidateCellRangeV1({
            centerScaled,

            radiusScaled:
              1n,

            physicsFixedScale:
              1000,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_CIRCLE_CANDIDATE_CELL_RANGE_V1",
        }
      );
    }
  }
);


test(
  "radius must be positive canonical BigInt",
  () => {
    for (
      const radiusScaled
      of [
        0n,
        -1n,
        1,
        "1",
        null,
      ]
    ) {
      assert.throws(
        () =>
          deriveAxisCandidateCellRangeV1({
            centerScaled:
              0n,

            radiusScaled,

            physicsFixedScale:
              1000,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_CIRCLE_CANDIDATE_CELL_RANGE_V1",
        }
      );
    }
  }
);


test(
  "physics fixed scale must be a positive safe integer",
  () => {
    for (
      const physicsFixedScale
      of [
        0,
        -1,
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
        "1000",
        1000n,
        null,
      ]
    ) {
      assert.throws(
        () =>
          deriveAxisCandidateCellRangeV1({
            centerScaled:
              0n,

            radiusScaled:
              1n,

            physicsFixedScale,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_CIRCLE_CANDIDATE_CELL_RANGE_V1",
        }
      );
    }
  }
);
