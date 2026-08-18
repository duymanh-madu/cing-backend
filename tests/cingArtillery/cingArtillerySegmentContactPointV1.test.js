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
  SEGMENT_CONTACT_POINT_KIND_V1,
  createAffineContactCoordinateV1,
  createSegmentContactPointV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySegmentContactPointV1"
  );


function segment({
  startX =
    1000n,

  startY =
    2000n,

  endX =
    5000n,

  endY =
    6000n,
} = {}) {
  return {
    start_x_scaled:
      startX,

    start_y_scaled:
      startY,

    end_x_scaled:
      endX,

    end_y_scaled:
      endY,
  };
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


test(
  "representation kind contract is immutable and explicit",
  () => {
    assert.deepEqual(
      SEGMENT_CONTACT_POINT_KIND_V1,
      {
        POINT:
          "affine_contact_point",

        COORDINATE:
          "affine_contact_coordinate",
      }
    );

    assert.ok(
      Object.isFrozen(
        SEGMENT_CONTACT_POINT_KIND_V1
      )
    );
  }
);


test(
  "rational midpoint is represented exactly without projection",
  () => {
    const parameter =
      rational(
        1n,
        2n
      );

    const result =
      createSegmentContactPointV1({
        trajectorySegment:
          segment(),

        contactParameter:
          parameter,
      });


    assert.deepEqual(
      result,
      {
        kind:
          "affine_contact_point",

        x_coordinate: {
          kind:
            "affine_contact_coordinate",

          start_scaled:
            1000n,

          delta_scaled:
            4000n,

          contact_parameter:
            parameter,
        },

        y_coordinate: {
          kind:
            "affine_contact_coordinate",

          start_scaled:
            2000n,

          delta_scaled:
            4000n,

          contact_parameter:
            parameter,
        },
      }
    );
  }
);


test(
  "zero parameter represents exact segment start",
  () => {
    const parameter =
      rational(
        0n,
        1n
      );

    const result =
      createSegmentContactPointV1({
        trajectorySegment:
          segment(),

        contactParameter:
          parameter,
      });


    assert.equal(
      result.x_coordinate.start_scaled,
      1000n
    );

    assert.equal(
      result.y_coordinate.start_scaled,
      2000n
    );

    assert.equal(
      result.x_coordinate.contact_parameter,
      parameter
    );
  }
);


test(
  "one parameter preserves exact endpoint relation",
  () => {
    const parameter =
      rational(
        1n,
        1n
      );

    const result =
      createSegmentContactPointV1({
        trajectorySegment:
          segment(),

        contactParameter:
          parameter,
      });


    assert.equal(
      result.x_coordinate.start_scaled +
        result.x_coordinate.delta_scaled,
      5000n
    );

    assert.equal(
      result.y_coordinate.start_scaled +
        result.y_coordinate.delta_scaled,
      6000n
    );
  }
);


test(
  "negative segment deltas remain exact BigInt",
  () => {
    const result =
      createSegmentContactPointV1({
        trajectorySegment:
          segment({
            startX:
              5000n,

            startY:
              6000n,

            endX:
              1000n,

            endY:
              2000n,
          }),

        contactParameter:
          rational(
            1n,
            3n
          ),
      });


    assert.equal(
      result.x_coordinate.delta_scaled,
      -4000n
    );

    assert.equal(
      result.y_coordinate.delta_scaled,
      -4000n
    );
  }
);


test(
  "stationary axis remains exact zero delta",
  () => {
    const result =
      createSegmentContactPointV1({
        trajectorySegment:
          segment({
            startX:
              3000n,

            endX:
              3000n,
          }),

        contactParameter:
          rational(
            2n,
            3n
          ),
      });


    assert.equal(
      result.x_coordinate.delta_scaled,
      0n
    );
  }
);


test(
  "irrational contact remains symbolic and exact on both axes",
  () => {
    /*
     * t =
     *
     *   (3 - sqrt(5)) / 2
     *
     * strictly inside [0,1].
     */
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
      createSegmentContactPointV1({
        trajectorySegment:
          segment(),

        contactParameter:
          parameter,
      });


    assert.equal(
      result.x_coordinate.contact_parameter,
      parameter
    );

    assert.equal(
      result.y_coordinate.contact_parameter,
      parameter
    );

    assert.equal(
      result.x_coordinate.contact_parameter.kind,
      "quadratic_lower_root"
    );
  }
);


test(
  "same immutable contact parameter object is shared by both axes",
  () => {
    const parameter =
      rational(
        1n,
        4n
      );

    const result =
      createSegmentContactPointV1({
        trajectorySegment:
          segment(),

        contactParameter:
          parameter,
      });


    assert.equal(
      result.x_coordinate.contact_parameter,
      parameter
    );

    assert.equal(
      result.y_coordinate.contact_parameter,
      parameter
    );
  }
);


test(
  "point and coordinates are all frozen",
  () => {
    const result =
      createSegmentContactPointV1({
        trajectorySegment:
          segment(),

        contactParameter:
          rational(
            1n,
            2n
          ),
      });


    assert.ok(
      Object.isFrozen(
        result
      )
    );

    assert.ok(
      Object.isFrozen(
        result.x_coordinate
      )
    );

    assert.ok(
      Object.isFrozen(
        result.y_coordinate
      )
    );

    assert.ok(
      Object.isFrozen(
        result.x_coordinate.contact_parameter
      )
    );
  }
);


test(
  "arbitrarily large BigInt trajectory values remain representable",
  () => {
    const huge =
      10n ** 80n;

    const result =
      createSegmentContactPointV1({
        trajectorySegment:
          segment({
            startX:
              huge,

            startY:
              -huge,

            endX:
              huge +
              123456789n,

            endY:
              -huge -
              987654321n,
          }),

        contactParameter:
          rational(
            7n,
            11n
          ),
      });


    assert.equal(
      result.x_coordinate.delta_scaled,
      123456789n
    );

    assert.equal(
      result.y_coordinate.delta_scaled,
      -987654321n
    );
  }
);


test(
  "non-canonical rational contact parameter fails closed",
  () => {
    assert.throws(
      () =>
        createSegmentContactPointV1({
          trajectorySegment:
            segment(),

          contactParameter: {
            kind:
              "rational",

            numerator:
              2n,

            denominator:
              4n,
          },
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SEGMENT_CONTACT_POINT_V1",
      }
    );
  }
);


test(
  "unknown contact parameter kind fails closed",
  () => {
    assert.throws(
      () =>
        createSegmentContactPointV1({
          trajectorySegment:
            segment(),

          contactParameter: {
            kind:
              "unknown",
          },
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SEGMENT_CONTACT_POINT_V1",
      }
    );
  }
);


test(
  "trajectory coordinates must remain BigInt",
  () => {
    assert.throws(
      () =>
        createSegmentContactPointV1({
          trajectorySegment: {
            start_x_scaled:
              1000,

            start_y_scaled:
              2000n,

            end_x_scaled:
              5000n,

            end_y_scaled:
              6000n,
          },

          contactParameter:
            rational(
              1n,
              2n
            ),
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SEGMENT_CONTACT_POINT_V1",
      }
    );
  }
);


test(
  "missing point envelope fails closed",
  () => {
    assert.throws(
      () =>
        createSegmentContactPointV1(),
      {
        code:
          "CING_ARTILLERY_INVALID_SEGMENT_CONTACT_POINT_V1",
      }
    );
  }
);


test(
  "standalone affine coordinate authority validates canonical contact",
  () => {
    const parameter =
      rational(
        3n,
        5n
      );

    const coordinate =
      createAffineContactCoordinateV1({
        startScaled:
          -100n,

        deltaScaled:
          900n,

        contactParameter:
          parameter,
      });


    assert.deepEqual(
      coordinate,
      {
        kind:
          "affine_contact_coordinate",

        start_scaled:
          -100n,

        delta_scaled:
          900n,

        contact_parameter:
          parameter,
      }
    );

    assert.ok(
      Object.isFrozen(
        coordinate
      )
    );
  }
);
