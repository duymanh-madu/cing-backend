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
  calculateExactBlastDistanceFloorV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryExactBlastDistanceFloorV1"
  );


function exactPoint({
  startX,
  startY,
  endX,
  endY,
  parameter,
}) {
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


function rational(
  numerator,
  denominator
) {
  return createRationalContactParameterV1({
    numerator,
    denominator,
  });
}


function irrational() {
  /*
   * t =
   *   (2 - sqrt(2)) / 2
   *
   * ~= 0.292893...
   */
  return createQuadraticLowerRootContactParameterV1({
    a:
      1n,

    b:
      -2n,

    discriminant:
      2n,
  });
}


function distanceFloor({
  point,
  centerX =
    0n,
  centerY =
    0n,
  radius,
}) {
  return calculateExactBlastDistanceFloorV1({
    exactImpact:
      point,

    targetCenterXScaled:
      centerX,

    targetCenterYScaled:
      centerY,

    blastRadiusScaled:
      radius,
  }).distance_floor_scaled;
}


test(
  "exact integer rational distance preserves exact floor",
  () => {
    const point =
      exactPoint({
        startX:
          0n,

        startY:
          0n,

        endX:
          6n,

        endY:
          8n,

        parameter:
          rational(
            1n,
            1n
          ),
      });


    assert.equal(
      distanceFloor({
        point,
        radius:
          11n,
      }),
      10n
    );
  }
);


test(
  "rational non-integer Euclidean distance floors exactly",
  () => {
    const point =
      exactPoint({
        startX:
          0n,

        startY:
          0n,

        endX:
          7n,

        endY:
          0n,

        parameter:
          rational(
            1n,
            2n
          ),
      });


    /*
     * distance = 7/2 = 3.5
     */
    assert.equal(
      distanceFloor({
        point,
        radius:
          4n,
      }),
      3n
    );
  }
);


test(
  "sub-unit rational distance floors to zero",
  () => {
    const point =
      exactPoint({
        startX:
          0n,

        startY:
          0n,

        endX:
          1n,

        endY:
          0n,

        parameter:
          rational(
            1n,
            2n
          ),
      });


    assert.equal(
      distanceFloor({
        point,
        radius:
          1n,
      }),
      0n
    );
  }
);


test(
  "zero exact distance floors to zero",
  () => {
    const point =
      exactPoint({
        startX:
          5n,

        startY:
          -7n,

        endX:
          5n,

        endY:
          -7n,

        parameter:
          irrational(),
      });


    assert.equal(
      distanceFloor({
        point,

        centerX:
          5n,

        centerY:
          -7n,

        radius:
          1n,
      }),
      0n
    );
  }
);


test(
  "quadratic irrational distance floors without projection",
  () => {
    const point =
      exactPoint({
        startX:
          0n,

        startY:
          0n,

        endX:
          10n,

        endY:
          0n,

        parameter:
          irrational(),
      });


    /*
     * distance =
     *
     *   10 * (2 - sqrt(2)) / 2
     *
     * ~= 2.9289...
     *
     * floor = 2
     */
    assert.equal(
      distanceFloor({
        point,
        radius:
          3n,
      }),
      2n
    );
  }
);


test(
  "quadratic irrational exact integer tangency returns that integer",
  () => {
    const point =
      exactPoint({
        startX:
          -1n,

        startY:
          -1n,

        endX:
          0n,

        endY:
          0n,

        parameter:
          irrational(),
      });


    /*
     * Existing exact algebra proof:
     *
     * distance^2 = 1
     *
     * therefore distance = 1 exactly.
     */
    assert.equal(
      distanceFloor({
        point,
        radius:
          1n,
      }),
      1n
    );
  }
);


test(
  "translated target center preserves exact floor semantics",
  () => {
    const point =
      exactPoint({
        startX:
          100n,

        startY:
          -50n,

        endX:
          106n,

        endY:
          -42n,

        parameter:
          rational(
            1n,
            1n
          ),
      });


    /*
     * Relative displacement from center (100,-50)
     * is (6,8), distance 10.
     */
    assert.equal(
      distanceFloor({
        point,

        centerX:
          100n,

        centerY:
          -50n,

        radius:
          10n,
      }),
      10n
    );
  }
);


test(
  "canonical blast radius acts as hard upper bound",
  () => {
    const point =
      exactPoint({
        startX:
          0n,

        startY:
          0n,

        endX:
          6n,

        endY:
          8n,

        parameter:
          rational(
            1n,
            1n
          ),
      });


    assert.throws(
      () =>
        distanceFloor({
          point,

          radius:
            9n,
        }),
      {
        code:
          "CING_ARTILLERY_EXACT_BLAST_DISTANCE_OUTSIDE_RADIUS_V1",
      }
    );
  }
);


test(
  "binary search handles large exact upper bound deterministically",
  () => {
    const point =
      exactPoint({
        startX:
          0n,

        startY:
          0n,

        endX:
          123456789n,

        endY:
          0n,

        parameter:
          rational(
            1n,
            1n
          ),
      });


    assert.equal(
      distanceFloor({
        point,

        radius:
          9007199254740991n,
      }),
      123456789n
    );
  }
);


test(
  "center and upper bound must remain exact BigInt geometry",
  () => {
    const point =
      exactPoint({
        startX:
          0n,

        startY:
          0n,

        endX:
          1n,

        endY:
          0n,

        parameter:
          rational(
            1n,
            2n
          ),
      });


    assert.throws(
      () =>
        calculateExactBlastDistanceFloorV1({
          exactImpact:
            point,

          targetCenterXScaled:
            0,

          targetCenterYScaled:
            0n,

          blastRadiusScaled:
            1n,
        })
    );


    assert.throws(
      () =>
        calculateExactBlastDistanceFloorV1({
          exactImpact:
            point,

          targetCenterXScaled:
            0n,

          targetCenterYScaled:
            0n,

          blastRadiusScaled:
            0n,
        })
    );
  }
);


test(
  "result is immutable",
  () => {
    const point =
      exactPoint({
        startX:
          0n,

        startY:
          0n,

        endX:
          7n,

        endY:
          0n,

        parameter:
          rational(
            1n,
            2n
          ),
      });


    const result =
      calculateExactBlastDistanceFloorV1({
        exactImpact:
          point,

        targetCenterXScaled:
          0n,

        targetCenterYScaled:
          0n,

        blastRadiusScaled:
          4n,
      });


    assert.ok(
      Object.isFrozen(
        result
      )
    );

    assert.equal(
      result.distance_floor_scaled,
      3n
    );
  }
);
