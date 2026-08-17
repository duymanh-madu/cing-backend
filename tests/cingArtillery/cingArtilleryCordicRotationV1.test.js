"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  TRIG_ANGLE_SCALE_V1,
  TRIG_VALUE_SCALE_V1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryTrigAlgorithmV1Contract"
  );

const {
  arithmeticShiftRightFloorBigIntV1,
  rotateCordicFirstQuadrantV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryCordicRotationV1"
  );


const ANGLE_SCALE =
  BigInt(
    TRIG_ANGLE_SCALE_V1
  );

const VALUE_SCALE =
  BigInt(
    TRIG_VALUE_SCALE_V1
  );


function degrees(
  value
) {
  return (
    BigInt(value) *
    ANGLE_SCALE
  );
}


test(
  "CORDIC signed right shift uses mathematical floor semantics",
  () => {
    assert.equal(
      arithmeticShiftRightFloorBigIntV1(
        5n,
        1
      ),
      2n
    );

    assert.equal(
      arithmeticShiftRightFloorBigIntV1(
        -5n,
        1
      ),
      -3n
    );

    assert.equal(
      arithmeticShiftRightFloorBigIntV1(
        7n,
        2
      ),
      1n
    );

    assert.equal(
      arithmeticShiftRightFloorBigIntV1(
        -7n,
        2
      ),
      -2n
    );

    assert.equal(
      arithmeticShiftRightFloorBigIntV1(
        -1n,
        31
      ),
      -1n
    );
  }
);


test(
  "CORDIC signed right shift rejects invalid shift count",
  () => {
    assert.throws(
      () =>
        arithmeticShiftRightFloorBigIntV1(
          1n,
          -1
        ),
      {
        code:
          "CING_ARTILLERY_CORDIC_SHIFT_INVALID",
      }
    );

    assert.throws(
      () =>
        arithmeticShiftRightFloorBigIntV1(
          1n,
          32
        ),
      {
        code:
          "CING_ARTILLERY_CORDIC_SHIFT_INVALID",
      }
    );
  }
);


test(
  "CORDIC 0 degrees is exact cardinal identity",
  () => {
    const result =
      rotateCordicFirstQuadrantV1({
        angleTrigUnits:
          0n,
      });

    assert.deepEqual(
      result,
      {
        cos_scaled:
          VALUE_SCALE,

        sin_scaled:
          0n,

        residual_angle_units:
          0n,
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
  "CORDIC 90 degrees is exact cardinal identity",
  () => {
    const result =
      rotateCordicFirstQuadrantV1({
        angleTrigUnits:
          degrees(90),
      });

    assert.deepEqual(
      result,
      {
        cos_scaled:
          0n,

        sin_scaled:
          VALUE_SCALE,

        residual_angle_units:
          0n,
      }
    );
  }
);


test(
  "CORDIC V1 exact golden vectors are stable",
  () => {
    const vectors = [
      [
        10,
        984807751n,
        173648178n,
        22n,
      ],
      [
        30,
        866025399n,
        500000001n,
        2n,
      ],
      [
        45,
        707106785n,
        707106779n,
        -6n,
      ],
      [
        60,
        500000001n,
        866025399n,
        -2n,
      ],
      [
        80,
        173648178n,
        984807751n,
        -22n,
      ],
    ];

    for (
      const [
        angle,
        expectedCos,
        expectedSin,
        expectedResidual,
      ]
      of vectors
    ) {
      const result =
        rotateCordicFirstQuadrantV1({
          angleTrigUnits:
            degrees(angle),
        });

      assert.equal(
        result.cos_scaled,
        expectedCos,
        `${angle}° cos`
      );

      assert.equal(
        result.sin_scaled,
        expectedSin,
        `${angle}° sin`
      );

      assert.equal(
        result.residual_angle_units,
        expectedResidual,
        `${angle}° residual`
      );
    }
  }
);


test(
  "CORDIC complementary first-quadrant vectors preserve expected symmetry",
  () => {
    const ten =
      rotateCordicFirstQuadrantV1({
        angleTrigUnits:
          degrees(10),
      });

    const eighty =
      rotateCordicFirstQuadrantV1({
        angleTrigUnits:
          degrees(80),
      });

    assert.equal(
      ten.cos_scaled,
      eighty.sin_scaled
    );

    assert.equal(
      ten.sin_scaled,
      eighty.cos_scaled
    );


    const thirty =
      rotateCordicFirstQuadrantV1({
        angleTrigUnits:
          degrees(30),
      });

    const sixty =
      rotateCordicFirstQuadrantV1({
        angleTrigUnits:
          degrees(60),
      });

    assert.equal(
      thirty.cos_scaled,
      sixty.sin_scaled
    );

    assert.equal(
      thirty.sin_scaled,
      sixty.cos_scaled
    );
  }
);


test(
  "CORDIC first-quadrant outputs remain non-negative",
  () => {
    for (
      let angle = 0;
      angle <= 90;
      angle += 1
    ) {
      const result =
        rotateCordicFirstQuadrantV1({
          angleTrigUnits:
            degrees(angle),
        });

      assert.ok(
        result.cos_scaled >= 0n,
        `${angle}° cos must be non-negative`
      );

      assert.ok(
        result.sin_scaled >= 0n,
        `${angle}° sin must be non-negative`
      );
    }
  }
);


test(
  "CORDIC first-quadrant cosine decreases and sine increases over integer degrees",
  () => {
    let previous =
      rotateCordicFirstQuadrantV1({
        angleTrigUnits:
          degrees(0),
      });

    for (
      let angle = 1;
      angle <= 90;
      angle += 1
    ) {
      const current =
        rotateCordicFirstQuadrantV1({
          angleTrigUnits:
            degrees(angle),
        });

      assert.ok(
        current.cos_scaled <=
          previous.cos_scaled,
        `${angle}° cosine monotonicity`
      );

      assert.ok(
        current.sin_scaled >=
          previous.sin_scaled,
        `${angle}° sine monotonicity`
      );

      previous =
        current;
    }
  }
);


test(
  "CORDIC residual remains below final micro-angle scale for integer-degree interior angles",
  () => {
    for (
      let angle = 1;
      angle < 90;
      angle += 1
    ) {
      const result =
        rotateCordicFirstQuadrantV1({
          angleTrigUnits:
            degrees(angle),
        });

      const residual =
        result.residual_angle_units < 0n
          ? -result.residual_angle_units
          : result.residual_angle_units;

      assert.ok(
        residual <= 26n,
        `${angle}° residual=${residual}`
      );
    }
  }
);


test(
  "CORDIC rejects angles outside canonical first quadrant",
  () => {
    assert.throws(
      () =>
        rotateCordicFirstQuadrantV1({
          angleTrigUnits:
            -1n,
        }),
      {
        code:
          "CING_ARTILLERY_CORDIC_ANGLE_OUT_OF_RANGE",
      }
    );

    assert.throws(
      () =>
        rotateCordicFirstQuadrantV1({
          angleTrigUnits:
            degrees(90) +
            1n,
        }),
      {
        code:
          "CING_ARTILLERY_CORDIC_ANGLE_OUT_OF_RANGE",
      }
    );
  }
);


test(
  "CORDIC requires canonical BigInt trig-angle input",
  () => {
    assert.throws(
      () =>
        rotateCordicFirstQuadrantV1({
          angleTrigUnits:
            45,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_CORDIC_ROTATION_V1",
      }
    );
  }
);
