"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  MAX_SAFE_SCALED_MAGNITUDE,

  toReducedRationalBigIntV1,
  toScaledBigInt,

  floorDivBigInt,
  mulDivFloorBigInt,

  clampBigInt,
  absBigInt,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryFixedPoint"
  );


test(
  "integer converts exactly to fixed point",
  () => {
    assert.equal(
      toScaledBigInt(
        980,
        1000,
        "gravity"
      ),
      980000n
    );
  }
);


test(
  "decimal converts without floating-point multiplication authority",
  () => {
    assert.equal(
      toScaledBigInt(
        0.1,
        1000,
        "ratio"
      ),
      100n
    );

    assert.equal(
      toScaledBigInt(
        -0.1,
        1000,
        "wind"
      ),
      -100n
    );
  }
);


test(
  "scientific notation converts exactly",
  () => {
    assert.equal(
      toScaledBigInt(
        1e-3,
        1000,
        "small"
      ),
      1n
    );
  }
);


test(
  "value outside configured fixed grid fails closed",
  () => {
    assert.throws(
      () =>
        toScaledBigInt(
          0.0001,
          1000,
          "too_precise"
        ),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      }
    );
  }
);


test(
  "scaled input magnitude is bounded",
  () => {
    assert.equal(
      toScaledBigInt(
        Number.MAX_SAFE_INTEGER,
        1,
        "safe"
      ),
      MAX_SAFE_SCALED_MAGNITUDE
    );

    assert.throws(
      () =>
        toScaledBigInt(
          Number.MAX_SAFE_INTEGER,
          2,
          "overflow"
        ),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_RANGE_ERROR",
      }
    );
  }
);


test(
  "floor division differs correctly from BigInt truncation for negatives",
  () => {
    assert.equal(
      1n / 3n,
      0n
    );

    assert.equal(
      -1n / 3n,
      0n
    );

    assert.equal(
      floorDivBigInt(
        1n,
        3n
      ),
      0n
    );

    assert.equal(
      floorDivBigInt(
        -1n,
        3n
      ),
      -1n
    );

    assert.equal(
      floorDivBigInt(
        1n,
        -3n
      ),
      -1n
    );

    assert.equal(
      floorDivBigInt(
        -1n,
        -3n
      ),
      0n
    );
  }
);


test(
  "floor division preserves exact divisions",
  () => {
    assert.equal(
      floorDivBigInt(
        12n,
        3n
      ),
      4n
    );

    assert.equal(
      floorDivBigInt(
        -12n,
        3n
      ),
      -4n
    );
  }
);


test(
  "mulDivFloor uses deterministic floor semantics",
  () => {
    assert.equal(
      mulDivFloorBigInt(
        5n,
        5n,
        2n
      ),
      12n
    );

    assert.equal(
      mulDivFloorBigInt(
        -5n,
        5n,
        2n
      ),
      -13n
    );
  }
);


test(
  "divide by zero fails closed",
  () => {
    assert.throws(
      () =>
        floorDivBigInt(
          1n,
          0n
        ),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_DIVIDE_BY_ZERO",
      }
    );
  }
);


test(
  "clamp and absolute primitives are exact",
  () => {
    assert.equal(
      clampBigInt(
        -5n,
        0n,
        10n
      ),
      0n
    );

    assert.equal(
      clampBigInt(
        15n,
        0n,
        10n
      ),
      10n
    );

    assert.equal(
      clampBigInt(
        7n,
        0n,
        10n
      ),
      7n
    );

    assert.equal(
      absBigInt(-7n),
      7n
    );
  }
);


test(
  "canonical decimal converts to reduced rational without external scale",
  () => {
    assert.deepEqual(
      toReducedRationalBigIntV1(
        0.3,
        "ratio"
      ),
      {
        numerator:
          3n,

        denominator:
          10n,
      }
    );


    assert.deepEqual(
      toReducedRationalBigIntV1(
        300,
        "base_damage"
      ),
      {
        numerator:
          300n,

        denominator:
          1n,
      }
    );
  }
);


test(
  "reduced rational preserves exact canonical decimal semantics",
  () => {
    assert.deepEqual(
      toReducedRationalBigIntV1(
        1.25,
        "value"
      ),
      {
        numerator:
          5n,

        denominator:
          4n,
      }
    );


    assert.deepEqual(
      toReducedRationalBigIntV1(
        -0.125,
        "value"
      ),
      {
        numerator:
          -1n,

        denominator:
          8n,
      }
    );
  }
);


test(
  "scientific notation becomes exact reduced rational",
  () => {
    assert.deepEqual(
      toReducedRationalBigIntV1(
        1e-3,
        "value"
      ),
      {
        numerator:
          1n,

        denominator:
          1000n,
      }
    );


    assert.deepEqual(
      toReducedRationalBigIntV1(
        1e3,
        "value"
      ),
      {
        numerator:
          1000n,

        denominator:
          1n,
      }
    );
  }
);


test(
  "zero canonicalizes to rational zero over one",
  () => {
    assert.deepEqual(
      toReducedRationalBigIntV1(
        0,
        "value"
      ),
      {
        numerator:
          0n,

        denominator:
          1n,
      }
    );


    assert.deepEqual(
      toReducedRationalBigIntV1(
        -0,
        "value"
      ),
      {
        numerator:
          0n,

        denominator:
          1n,
      }
    );
  }
);


test(
  "canonical Number identity is preserved rather than rounded to friendly decimal",
  () => {
    const result =
      toReducedRationalBigIntV1(
        0.30000000000000004,
        "value"
      );


    assert.deepEqual(
      result,
      {
        numerator:
          7500000000000001n,

        denominator:
          25000000000000000n,
      }
    );


    assert.notDeepEqual(
      result,
      {
        numerator:
          3n,

        denominator:
          10n,
      }
    );
  }
);


test(
  "non-finite values fail closed through shared canonical decimal parser",
  () => {
    for (
      const value
      of [
        NaN,
        Infinity,
        -Infinity,
      ]
    ) {
      assert.throws(
        () =>
          toReducedRationalBigIntV1(
            value,
            "value"
          )
      );
    }
  }
);


test(
  "reduced rational result is immutable",
  () => {
    const result =
      toReducedRationalBigIntV1(
        0.25,
        "value"
      );


    assert.ok(
      Object.isFrozen(
        result
      )
    );

    assert.equal(
      result.numerator,
      1n
    );

    assert.equal(
      result.denominator,
      4n
    );
  }
);
