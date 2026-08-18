"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  createRationalContactParameterV1,
  createQuadraticLowerRootContactParameterV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryContactParameterV1"
  );

const {
  createSegmentContactPointV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySegmentContactPointV1"
  );

const {
  IMPACT_NUMERIC_PROJECTION_V1,
  serializeProjectedQuantumV1,
  projectAffineContactCoordinateToNumericV1,
  projectImpactNumericV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryImpactNumericProjectionV1"
  );


function rational(
  numerator,
  denominator
) {
  return createRationalContactParameterV1({
    numerator,
    denominator,
  });
}


function point({
  startX =
    0n,

  startY =
    0n,

  endX =
    1000n,

  endY =
    1000n,

  parameter =
    rational(
      1n,
      2n
    ),
} = {}) {
  return createSegmentContactPointV1({
    trajectorySegment: {
      start_x_scaled:
        startX,

      start_y_scaled:
        startY,

      end_x_scaled:
        endX,

      end_y_scaled:
        endY,
    },

    contactParameter:
      parameter,
  });
}


test(
  "projection policy constants are immutable and exact",
  () => {
    assert.equal(
      IMPACT_NUMERIC_PROJECTION_V1.VERSION,
      1
    );

    assert.equal(
      IMPACT_NUMERIC_PROJECTION_V1.DECIMAL_PLACES,
      12
    );

    assert.equal(
      IMPACT_NUMERIC_PROJECTION_V1.DECIMAL_SCALE,
      1000000000000n
    );

    assert.ok(
      Object.isFrozen(
        IMPACT_NUMERIC_PROJECTION_V1
      )
    );
  }
);


test(
  "zero serializes canonically",
  () => {
    assert.equal(
      serializeProjectedQuantumV1(
        0n
      ),
      "0"
    );
  }
);


test(
  "whole solver coordinate removes fractional decimal point",
  () => {
    const result =
      projectImpactNumericV1({
        exactImpactPoint:
          point({
            startX:
              1000n,

            endX:
              1000n,

            startY:
              2000n,

            endY:
              2000n,

            parameter:
              rational(
                0n,
                1n
              ),
          }),

        physicsFixedScale:
          1000,
      });


    assert.deepEqual(
      result,
      {
        projection_version:
          1,

        impact_x:
          "1",

        impact_y:
          "2",
      }
    );
  }
);


test(
  "exact rational decimal preserves canonical trailing-zero trimming",
  () => {
    const exactPoint =
      point({
        startX:
          0n,

        endX:
          1n,

        startY:
          0n,

        endY:
          1n,

        parameter:
          rational(
            1n,
            2n
          ),
      });


    assert.equal(
      projectAffineContactCoordinateToNumericV1({
        coordinate:
          exactPoint.x_coordinate,

        physicsFixedScale:
          1,
      }),
      "0.5"
    );
  }
);


test(
  "positive exact half quantum rounds away from zero",
  () => {
    const exactPoint =
      point({
        startX:
          0n,

        endX:
          1n,

        startY:
          0n,

        endY:
          1n,

        parameter:
          rational(
            1n,
            2n
          ),
      });


    assert.equal(
      projectAffineContactCoordinateToNumericV1({
        coordinate:
          exactPoint.x_coordinate,

        physicsFixedScale:
          1000000000000,
      }),
      "0.000000000001"
    );
  }
);


test(
  "negative exact half quantum rounds away from zero",
  () => {
    const exactPoint =
      point({
        startX:
          0n,

        endX:
          -1n,

        startY:
          0n,

        endY:
          -1n,

        parameter:
          rational(
            1n,
            2n
          ),
      });


    assert.equal(
      projectAffineContactCoordinateToNumericV1({
        coordinate:
          exactPoint.x_coordinate,

        physicsFixedScale:
          1000000000000,
      }),
      "-0.000000000001"
    );
  }
);


test(
  "positive value below half quantum rounds toward zero",
  () => {
    const exactPoint =
      point({
        startX:
          0n,

        endX:
          1n,

        parameter:
          rational(
            49n,
            100n
          ),
      });


    assert.equal(
      projectAffineContactCoordinateToNumericV1({
        coordinate:
          exactPoint.x_coordinate,

        physicsFixedScale:
          1000000000000,
      }),
      "0"
    );
  }
);


test(
  "negative value above negative half quantum rounds toward zero",
  () => {
    const exactPoint =
      point({
        startX:
          0n,

        endX:
          -1n,

        parameter:
          rational(
            49n,
            100n
          ),
      });


    assert.equal(
      projectAffineContactCoordinateToNumericV1({
        coordinate:
          exactPoint.x_coordinate,

        physicsFixedScale:
          1000000000000,
      }),
      "0"
    );
  }
);


test(
  "irrational quadratic contact projects deterministically without sqrt",
  () => {
    const parameter =
      createQuadraticLowerRootContactParameterV1({
        a:
          1n,

        b:
          -3n,

        discriminant:
          5n,
      });


    const result =
      projectImpactNumericV1({
        exactImpactPoint:
          point({
            startX:
              0n,

            startY:
              0n,

            endX:
              1n,

            endY:
              1n,

            parameter,
          }),

        physicsFixedScale:
          1,
      });


    assert.equal(
      result.impact_x,
      "0.38196601125"
    );

    assert.equal(
      result.impact_y,
      "0.38196601125"
    );
  }
);


test(
  "mirrored irrational coordinate preserves exact signed rounding",
  () => {
    const parameter =
      createQuadraticLowerRootContactParameterV1({
        a:
          1n,

        b:
          -3n,

        discriminant:
          5n,
      });


    const result =
      projectImpactNumericV1({
        exactImpactPoint:
          point({
            startX:
              0n,

            endX:
              -1n,

            startY:
              0n,

            endY:
              1n,

            parameter,
          }),

        physicsFixedScale:
          1,
      });


    assert.equal(
      result.impact_x,
      "-0.38196601125"
    );

    assert.equal(
      result.impact_y,
      "0.38196601125"
    );
  }
);


test(
  "stationary affine coordinate projects exact start value",
  () => {
    const exactPoint =
      point({
        startX:
          -1250n,

        endX:
          -1250n,

        parameter:
          rational(
            3n,
            7n
          ),
      });


    assert.equal(
      projectAffineContactCoordinateToNumericV1({
        coordinate:
          exactPoint.x_coordinate,

        physicsFixedScale:
          1000,
      }),
      "-1.25"
    );
  }
);


test(
  "large durable scaled values remain BigInt exact",
  () => {
    const max =
      BigInt(
        Number.MAX_SAFE_INTEGER
      );

    const exactPoint =
      point({
        startX:
          max,

        endX:
          max,

        startY:
          -max,

        endY:
          -max,

        parameter:
          rational(
            0n,
            1n
          ),
      });


    const result =
      projectImpactNumericV1({
        exactImpactPoint:
          exactPoint,

        physicsFixedScale:
          1,
      });


    assert.equal(
      result.impact_x,
      max.toString()
    );

    assert.equal(
      result.impact_y,
      `-${max.toString()}`
    );
  }
);


test(
  "projection output is frozen",
  () => {
    const result =
      projectImpactNumericV1({
        exactImpactPoint:
          point(),

        physicsFixedScale:
          1000,
      });


    assert.ok(
      Object.isFrozen(
        result
      )
    );
  }
);


test(
  "invalid physics scale fails closed",
  () => {
    assert.throws(
      () =>
        projectImpactNumericV1({
          exactImpactPoint:
            point(),

          physicsFixedScale:
            0,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_IMPACT_NUMERIC_PROJECTION_V1",
      }
    );


    assert.throws(
      () =>
        projectImpactNumericV1({
          exactImpactPoint:
            point(),

          physicsFixedScale:
            1.5,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_IMPACT_NUMERIC_PROJECTION_V1",
      }
    );
  }
);


test(
  "malformed exact impact fails closed",
  () => {
    assert.throws(
      () =>
        projectImpactNumericV1({
          exactImpactPoint: {
            kind:
              "unknown",
          },

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_IMPACT_NUMERIC_PROJECTION_V1",
      }
    );
  }
);


test(
  "X and Y must share exact contact parameter identity",
  () => {
    const original =
      point();

    const malformed = {
      kind:
        original.kind,

      x_coordinate:
        original.x_coordinate,

      y_coordinate: {
        ...original.y_coordinate,

        contact_parameter:
          rational(
            1n,
            2n
          ),
      },
    };


    assert.throws(
      () =>
        projectImpactNumericV1({
          exactImpactPoint:
            malformed,

          physicsFixedScale:
            1000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_IMPACT_NUMERIC_PROJECTION_V1",
      }
    );
  }
);
