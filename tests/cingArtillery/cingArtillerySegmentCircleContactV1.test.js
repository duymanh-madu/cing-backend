"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  segmentIntersectsCircleV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySegmentCircleContactV1"
  );


function query(
  overrides = {}
) {
  return segmentIntersectsCircleV1({
    startX:
      0n,

    startY:
      0n,

    endX:
      10000n,

    endY:
      0n,

    circleX:
      5000n,

    circleY:
      0n,

    radius:
      1000n,

    ...overrides,
  });
}


test(
  "segment crossing circle interior contacts",
  () => {
    assert.equal(
      query(),
      true
    );
  }
);


test(
  "both endpoints outside can still contact circle between samples",
  () => {
    assert.equal(
      query({
        startX:
          0n,

        endX:
          10000n,

        circleX:
          5000n,

        circleY:
          0n,

        radius:
          100n,
      }),
      true
    );
  }
);


test(
  "exact interior tangent counts as contact",
  () => {
    assert.equal(
      query({
        circleY:
          1000n,

        radius:
          1000n,
      }),
      true
    );
  }
);


test(
  "one scaled unit beyond interior tangent is not contact",
  () => {
    assert.equal(
      query({
        circleY:
          1001n,

        radius:
          1000n,
      }),
      false
    );
  }
);


test(
  "start point inside circle contacts",
  () => {
    assert.equal(
      query({
        circleX:
          0n,

        circleY:
          0n,

        radius:
          1n,
      }),
      true
    );
  }
);


test(
  "end point exact tangent contacts",
  () => {
    assert.equal(
      query({
        circleX:
          11000n,

        circleY:
          0n,

        radius:
          1000n,
      }),
      true
    );
  }
);


test(
  "circle beyond segment end without endpoint contact is rejected",
  () => {
    assert.equal(
      query({
        circleX:
          11001n,

        circleY:
          0n,

        radius:
          1000n,
      }),
      false
    );
  }
);


test(
  "circle behind segment start without endpoint contact is rejected",
  () => {
    assert.equal(
      query({
        circleX:
          -1001n,

        circleY:
          0n,

        radius:
          1000n,
      }),
      false
    );
  }
);


test(
  "stationary point inside circle contacts",
  () => {
    assert.equal(
      query({
        startX:
          5000n,

        startY:
          5000n,

        endX:
          5000n,

        endY:
          5000n,

        circleX:
          5000n,

        circleY:
          5000n,

        radius:
          1n,
      }),
      true
    );
  }
);


test(
  "stationary point outside circle does not contact",
  () => {
    assert.equal(
      query({
        startX:
          5000n,

        startY:
          5000n,

        endX:
          5000n,

        endY:
          5000n,

        circleX:
          5002n,

        circleY:
          5000n,

        radius:
          1n,
      }),
      false
    );
  }
);


test(
  "diagonal exact tangent is detected without sqrt",
  () => {
    /*
     * Segment:
     *
     *   (0,0) -> (10000,10000)
     *
     * Circle center:
     *
     *   (4000,6000)
     *
     * Perpendicular distance to y=x:
     *
     *   |6000 - 4000| / sqrt(2)
     *   = 1000 * sqrt(2)
     *
     * radius² = 2,000,000 gives exact tangent without
     * needing an integer radius representation of sqrt(2)*1000.
     *
     * Instead use an equivalent scaled geometry:
     *
     * Segment (0,0)->(2,2)
     * center (0,2)
     * radius is not integral sqrt(2), so exact tangent cannot
     * be represented as integral radius.
     *
     * We therefore lock an exact 3-4-5 style tangent below.
     */
    assert.equal(
      segmentIntersectsCircleV1({
        startX:
          0n,

        startY:
          0n,

        endX:
          8000n,

        endY:
          6000n,

        circleX:
          1600n,

        circleY:
          6200n,

        radius:
          4000n,
      }),
      true
    );
  }
);


test(
  "negative coordinates preserve exact geometry",
  () => {
    assert.equal(
      segmentIntersectsCircleV1({
        startX:
          -10000n,

        startY:
          -5000n,

        endX:
          10000n,

        endY:
          -5000n,

        circleX:
          0n,

        circleY:
          -4000n,

        radius:
          1000n,
      }),
      true
    );
  }
);


test(
  "reversing segment endpoints preserves contact result",
  () => {
    const forward =
      query({
        circleX:
          5000n,

        circleY:
          999n,

        radius:
          1000n,
      });

    const reverse =
      segmentIntersectsCircleV1({
        startX:
          10000n,

        startY:
          0n,

        endX:
          0n,

        endY:
          0n,

        circleX:
          5000n,

        circleY:
          999n,

        radius:
          1000n,
      });

    assert.equal(
      forward,
      true
    );

    assert.equal(
      reverse,
      forward
    );
  }
);


test(
  "arbitrarily large BigInt coordinates remain exact",
  () => {
    const base =
      10n ** 80n;

    assert.equal(
      segmentIntersectsCircleV1({
        startX:
          base,

        startY:
          -base,

        endX:
          base + 10000n,

        endY:
          -base,

        circleX:
          base + 5000n,

        circleY:
          -base + 1000n,

        radius:
          1000n,
      }),
      true
    );
  }
);


test(
  "all coordinates must be canonical BigInts",
  () => {
    const invalid = [
      1,
      "1",
      null,
      undefined,
    ];

    const fields = [
      "startX",
      "startY",
      "endX",
      "endY",
      "circleX",
      "circleY",
    ];

    for (
      const field
      of fields
    ) {
      for (
        const value
        of invalid
      ) {
        assert.throws(
          () =>
            query({
              [field]:
                value,
            }),
          {
            code:
              "CING_ARTILLERY_INVALID_SEGMENT_CIRCLE_CONTACT_V1",
          }
        );
      }
    }
  }
);


test(
  "radius must be positive canonical BigInt",
  () => {
    for (
      const radius
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
          query({
            radius,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_SEGMENT_CIRCLE_CONTACT_V1",
        }
      );
    }
  }
);
