"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  signedMagnitudeFloorDivV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryTrajectoryQuantizationV1"
  );


test(
  "trajectory quantization preserves exact positive and negative divisions",
  () => {
    assert.equal(
      signedMagnitudeFloorDivV1(
        1000n,
        10n
      ),
      100n
    );

    assert.equal(
      signedMagnitudeFloorDivV1(
        -1000n,
        10n
      ),
      -100n
    );
  }
);


test(
  "trajectory quantization preserves mirror symmetry for non-integral values",
  () => {
    assert.equal(
      signedMagnitudeFloorDivV1(
        70710n,
        100n
      ),
      707n
    );

    assert.equal(
      signedMagnitudeFloorDivV1(
        -70710n,
        100n
      ),
      -707n
    );
  }
);


test(
  "sub-lattice positive and negative magnitudes both quantize to zero",
  () => {
    assert.equal(
      signedMagnitudeFloorDivV1(
        1n,
        1000n
      ),
      0n
    );

    assert.equal(
      signedMagnitudeFloorDivV1(
        -1n,
        1000n
      ),
      0n
    );
  }
);


test(
  "velocity delta golden mirror remains +1000 and -1000",
  () => {
    assert.equal(
      signedMagnitudeFloorDivV1(
        100001n * 10n,
        1000n
      ),
      1000n
    );

    assert.equal(
      signedMagnitudeFloorDivV1(
        -100001n * 10n,
        1000n
      ),
      -1000n
    );
  }
);


test(
  "ballistic displacement golden mirror remains +707 and -707",
  () => {
    const msPerSecond =
      1000n;

    const elapsedMs =
      10n;

    const velocity =
      70710n;

    const denominator =
      2n *
      msPerSecond *
      msPerSecond;

    const positiveNumerator =
      2n *
      velocity *
      elapsedMs *
      msPerSecond;

    const negativeNumerator =
      -positiveNumerator;

    assert.equal(
      signedMagnitudeFloorDivV1(
        positiveNumerator,
        denominator
      ),
      707n
    );

    assert.equal(
      signedMagnitudeFloorDivV1(
        negativeNumerator,
        denominator
      ),
      -707n
    );
  }
);


test(
  "zero numerator remains exact zero",
  () => {
    assert.equal(
      signedMagnitudeFloorDivV1(
        0n,
        1n
      ),
      0n
    );
  }
);


test(
  "trajectory quantization rejects non-BigInt values",
  () => {
    assert.throws(
      () =>
        signedMagnitudeFloorDivV1(
          1,
          1000n
        ),
      {
        code:
          "CING_ARTILLERY_INVALID_TRAJECTORY_QUANTIZATION_V1",
      }
    );

    assert.throws(
      () =>
        signedMagnitudeFloorDivV1(
          1n,
          1000
        ),
      {
        code:
          "CING_ARTILLERY_INVALID_TRAJECTORY_QUANTIZATION_V1",
      }
    );
  }
);


test(
  "trajectory quantization rejects zero or negative denominator",
  () => {
    assert.throws(
      () =>
        signedMagnitudeFloorDivV1(
          1n,
          0n
        ),
      {
        code:
          "CING_ARTILLERY_INVALID_TRAJECTORY_QUANTIZATION_V1",
      }
    );

    assert.throws(
      () =>
        signedMagnitudeFloorDivV1(
          1n,
          -1n
        ),
      {
        code:
          "CING_ARTILLERY_INVALID_TRAJECTORY_QUANTIZATION_V1",
      }
    );
  }
);
