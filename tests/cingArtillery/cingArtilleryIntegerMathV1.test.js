"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  integerSqrtFloor,
  integerDistanceFloor,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryIntegerMathV1"
  );


test(
  "integer sqrt handles zero and one",
  () => {
    assert.equal(
      integerSqrtFloor(0n),
      0n
    );

    assert.equal(
      integerSqrtFloor(1n),
      1n
    );
  }
);


test(
  "integer sqrt returns exact roots",
  () => {
    const vectors = [
      [4n, 2n],
      [9n, 3n],
      [16n, 4n],
      [25n, 5n],
      [100n, 10n],
      [10000n, 100n],
      [1000000n, 1000n],
    ];

    for (
      const [input, expected]
      of vectors
    ) {
      assert.equal(
        integerSqrtFloor(input),
        expected
      );
    }
  }
);


test(
  "integer sqrt floors non-square values",
  () => {
    const vectors = [
      [2n, 1n],
      [3n, 1n],
      [5n, 2n],
      [8n, 2n],
      [15n, 3n],
      [24n, 4n],
      [26n, 5n],
      [99n, 9n],
      [101n, 10n],
    ];

    for (
      const [input, expected]
      of vectors
    ) {
      assert.equal(
        integerSqrtFloor(input),
        expected
      );
    }
  }
);


test(
  "integer sqrt satisfies canonical floor invariant",
  () => {
    const vectors = [
      2n,
      7n,
      42n,
      999n,
      123456789n,
      999999999999999999n,
    ];

    for (const input of vectors) {
      const root =
        integerSqrtFloor(
          input
        );

      assert.ok(
        root * root <=
        input
      );

      assert.ok(
        (root + 1n) *
          (root + 1n) >
        input
      );
    }
  }
);


test(
  "negative sqrt fails closed",
  () => {
    assert.throws(
      () =>
        integerSqrtFloor(
          -1n
        ),
      {
        code:
          "CING_ARTILLERY_INTEGER_SQRT_NEGATIVE",
      }
    );
  }
);


test(
  "integer distance reproduces 3-4-5 geometry",
  () => {
    assert.equal(
      integerDistanceFloor({
        ax: 0n,
        ay: 0n,
        bx: 3n,
        by: 4n,
      }),
      5n
    );
  }
);


test(
  "integer distance is symmetric",
  () => {
    const forward =
      integerDistanceFloor({
        ax: -10n,
        ay: 7n,
        bx: 31n,
        by: -25n,
      });

    const reverse =
      integerDistanceFloor({
        ax: 31n,
        ay: -25n,
        bx: -10n,
        by: 7n,
      });

    assert.equal(
      forward,
      reverse
    );
  }
);


test(
  "integer distance floors irrational Euclidean distance",
  () => {
    assert.equal(
      integerDistanceFloor({
        ax: 0n,
        ay: 0n,
        bx: 1n,
        by: 1n,
      }),
      1n
    );

    assert.equal(
      integerDistanceFloor({
        ax: 0n,
        ay: 0n,
        bx: 2n,
        by: 2n,
      }),
      2n
    );
  }
);
