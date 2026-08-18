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
  affineContactPointInsideCircleV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryAffineContactPointCircleMembershipV1"
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


function irrationalV1() {
  /*
   * t =
   *
   *   (2 - sqrt(2)) / 2
   *
   * ~= 0.292893218...
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


test(
  "rational point strictly inside circle returns true",
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
          rational(
            1n,
            2n
          ),
      });


    assert.equal(
      affineContactPointInsideCircleV1({
        exactPoint:
          point,

        circleCenterXScaled:
          0n,

        circleCenterYScaled:
          0n,

        radiusScaled:
          6n,
      }),
      true
    );
  }
);


test(
  "closed circle includes exact rational tangency",
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
            2n
          ),
      });


    /*
     * exact point = (3, 4)
     * distance = 5
     */
    assert.equal(
      affineContactPointInsideCircleV1({
        exactPoint:
          point,

        circleCenterXScaled:
          0n,

        circleCenterYScaled:
          0n,

        radiusScaled:
          5n,
      }),
      true
    );
  }
);


test(
  "rational point outside circle returns false",
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
            2n
          ),
      });


    assert.equal(
      affineContactPointInsideCircleV1({
        exactPoint:
          point,

        circleCenterXScaled:
          0n,

        circleCenterYScaled:
          0n,

        radiusScaled:
          4n,
      }),
      false
    );
  }
);


test(
  "closed circle includes exact irrational tangency",
  () => {
    /*
     * t =
     *   (2 - sqrt(2)) / 2
     *
     * Therefore:
     *
     *   2*t^2 - 4*t + 1 = 0
     *
     * Choose:
     *
     *   start = (-1, -1)
     *   delta = (1, 1)
     *
     * exact point:
     *
     *   (t - 1, t - 1)
     *
     * squared distance from origin:
     *
     *   2 * (t - 1)^2
     *
     * = 2*t^2 - 4*t + 2
     * = 1
     *
     * Therefore radius = 1 is exact irrational
     * tangency.
     *
     * This also exercises:
     *
     *   P = 0
     *   Q = 0
     *
     * in the radical sign reduction.
     */
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
          irrationalV1(),
      });


    assert.equal(
      affineContactPointInsideCircleV1({
        exactPoint:
          point,

        circleCenterXScaled:
          0n,

        circleCenterYScaled:
          0n,

        radiusScaled:
          1n,
      }),
      true
    );
  }
);



test(
  "irrational quadratic point inside circle is classified exactly",
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
          irrationalV1(),
      });


    /*
     * x =
     *   10 * (2 - sqrt(2)) / 2
     *
     * ~= 2.9289...
     *
     * radius 3 => inside.
     *
     * This exercises the Q < 0 radical branch.
     */
    assert.equal(
      affineContactPointInsideCircleV1({
        exactPoint:
          point,

        circleCenterXScaled:
          0n,

        circleCenterYScaled:
          0n,

        radiusScaled:
          3n,
      }),
      true
    );
  }
);


test(
  "irrational quadratic point outside circle is classified exactly",
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
          irrationalV1(),
      });


    assert.equal(
      affineContactPointInsideCircleV1({
        exactPoint:
          point,

        circleCenterXScaled:
          0n,

        circleCenterYScaled:
          0n,

        radiusScaled:
          2n,
      }),
      false
    );
  }
);


test(
  "positive radical coefficient branch is exact",
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
          irrationalV1(),
      });


    /*
     * point x ~= 2.9289
     * fixed center x = 11
     * distance ~= 8.0711
     *
     * radius 9 => inside
     * radius 8 => outside
     *
     * This fixture drives Q > 0.
     */
    assert.equal(
      affineContactPointInsideCircleV1({
        exactPoint:
          point,

        circleCenterXScaled:
          11n,

        circleCenterYScaled:
          0n,

        radiusScaled:
          9n,
      }),
      true
    );


    assert.equal(
      affineContactPointInsideCircleV1({
        exactPoint:
          point,

        circleCenterXScaled:
          11n,

        circleCenterYScaled:
          0n,

        radiusScaled:
          8n,
      }),
      false
    );
  }
);


test(
  "stationary affine coordinates remain exact even with irrational parameter",
  () => {
    const parameter =
      irrationalV1();

    const point =
      exactPoint({
        startX:
          3n,

        startY:
          4n,

        endX:
          3n,

        endY:
          4n,

        parameter,
      });


    assert.equal(
      affineContactPointInsideCircleV1({
        exactPoint:
          point,

        circleCenterXScaled:
          0n,

        circleCenterYScaled:
          0n,

        radiusScaled:
          5n,
      }),
      true
    );


    assert.equal(
      affineContactPointInsideCircleV1({
        exactPoint:
          point,

        circleCenterXScaled:
          0n,

        circleCenterYScaled:
          0n,

        radiusScaled:
          4n,
      }),
      false
    );
  }
);


test(
  "rational branch matches independent denominator-cleared BigInt oracle",
  () => {
    let fixtures =
      0;


    for (
      let denominator =
        1n;

      denominator <=
        50n;

      denominator +=
        1n
    ) {
      for (
        let numerator =
          0n;

        numerator <=
          denominator;

        numerator +=
          1n
      ) {
        const parameter =
          rational(
            numerator,
            denominator
          );

        const point =
          exactPoint({
            startX:
              -10n,

            startY:
              5n,

            endX:
              10n,

            endY:
              -5n,

            parameter,
          });


        const p =
          parameter.numerator;

        const q =
          parameter.denominator;


        const xNumerator =
          -10n *
            q +
          20n *
            p;

        const yNumerator =
          5n *
            q -
          10n *
            p;


        const centerX =
          2n;

        const centerY =
          -1n;

        const radius =
          7n;


        const dxNumerator =
          xNumerator -
          centerX *
            q;

        const dyNumerator =
          yNumerator -
          centerY *
            q;


        const oracle =
          dxNumerator *
            dxNumerator +
          dyNumerator *
            dyNumerator <=
          radius *
            radius *
            q *
            q;


        const actual =
          affineContactPointInsideCircleV1({
            exactPoint:
              point,

            circleCenterXScaled:
              centerX,

            circleCenterYScaled:
              centerY,

            radiusScaled:
              radius,
          });


        assert.equal(
          actual,
          oracle
        );


        fixtures +=
          1;
      }
    }


    assert.ok(
      fixtures >
        1000
    );
  }
);


test(
  "X and Y must share the same exact ContactParameterV1 object",
  () => {
    const first =
      irrationalV1();

    const second =
      irrationalV1();


    const point = {
      kind:
        "affine_contact_point",

      x_coordinate: {
        kind:
          "affine_contact_coordinate",

        start_scaled:
          0n,

        delta_scaled:
          10n,

        contact_parameter:
          first,
      },

      y_coordinate: {
        kind:
          "affine_contact_coordinate",

        start_scaled:
          0n,

        delta_scaled:
          0n,

        contact_parameter:
          second,
      },
    };


    assert.throws(
      () =>
        affineContactPointInsideCircleV1({
          exactPoint:
            point,

          circleCenterXScaled:
            0n,

          circleCenterYScaled:
            0n,

          radiusScaled:
            3n,
        }),
      {
        code:
          "CING_ARTILLERY_AFFINE_CIRCLE_PARAMETER_IDENTITY_MISMATCH_V1",
      }
    );
  }
);


test(
  "non-canonical contact parameter fails closed",
  () => {
    const parameter = {
      kind:
        "rational",

      numerator:
        2n,

      denominator:
        4n,
    };


    const point = {
      kind:
        "affine_contact_point",

      x_coordinate: {
        kind:
          "affine_contact_coordinate",

        start_scaled:
          0n,

        delta_scaled:
          10n,

        contact_parameter:
          parameter,
      },

      y_coordinate: {
        kind:
          "affine_contact_coordinate",

        start_scaled:
          0n,

        delta_scaled:
          0n,

        contact_parameter:
          parameter,
      },
    };


    assert.throws(
      () =>
        affineContactPointInsideCircleV1({
          exactPoint:
            point,

          circleCenterXScaled:
            0n,

          circleCenterYScaled:
            0n,

          radiusScaled:
            3n,
        }),
      {
        code:
          "CING_ARTILLERY_AFFINE_CIRCLE_NON_CANONICAL_CONTACT_PARAMETER_V1",
      }
    );
  }
);


test(
  "circle center and radius must use exact BigInt geometry",
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
          rational(
            1n,
            2n
          ),
      });


    assert.throws(
      () =>
        affineContactPointInsideCircleV1({
          exactPoint:
            point,

          circleCenterXScaled:
            0,

          circleCenterYScaled:
            0n,

          radiusScaled:
            5n,
        })
    );


    assert.throws(
      () =>
        affineContactPointInsideCircleV1({
          exactPoint:
            point,

          circleCenterXScaled:
            0n,

          circleCenterYScaled:
            0n,

          radiusScaled:
            0n,
        })
    );
  }
);
