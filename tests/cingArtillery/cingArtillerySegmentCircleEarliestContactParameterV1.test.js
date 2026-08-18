"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  CONTACT_PARAMETER_KIND_V1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryContactParameterV1"
  );

const {
  segmentCircleEarliestContactParameterV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySegmentCircleEarliestContactParameterV1"
  );


function query(
  overrides =
    {}
) {
  return segmentCircleEarliestContactParameterV1({
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
  "start strictly inside circle returns canonical zero",
  () => {
    assert.deepEqual(
      query({
        circleX:
          0n,

        circleY:
          0n,

        radius:
          1n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          0n,

        denominator:
          1n,
      }
    );
  }
);


test(
  "start exactly tangent to circle returns canonical zero",
  () => {
    assert.deepEqual(
      query({
        circleX:
          0n,

        circleY:
          1000n,

        radius:
          1000n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          0n,

        denominator:
          1n,
      }
    );
  }
);


test(
  "stationary point outside circle returns null",
  () => {
    assert.equal(
      query({
        startX:
          0n,

        startY:
          0n,

        endX:
          0n,

        endY:
          0n,

        circleX:
          10n,

        circleY:
          0n,

        radius:
          1n,
      }),
      null
    );
  }
);


test(
  "segment missing circle returns null",
  () => {
    assert.equal(
      query({
        circleY:
          1001n,

        radius:
          1000n,
      }),
      null
    );
  }
);


test(
  "circle entirely beyond segment end returns null",
  () => {
    assert.equal(
      query({
        circleX:
          11001n,

        radius:
          1000n,
      }),
      null
    );
  }
);


test(
  "circle entirely behind segment start returns null",
  () => {
    assert.equal(
      query({
        circleX:
          -1001n,

        radius:
          1000n,
      }),
      null
    );
  }
);


test(
  "simple axial entry canonicalizes to rational contact parameter",
  () => {
    /*
     * Segment:
     *   x = 0 -> 10000
     *
     * Circle:
     *   center x = 5000
     *   radius = 1000
     *
     * first contact x = 4000
     *
     * therefore:
     *
     *   t = 4000 / 10000 = 2/5
     */
    assert.deepEqual(
      query(),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          2n,

        denominator:
          5n,
      }
    );
  }
);


test(
  "contact exactly at segment end returns canonical one",
  () => {
    /*
     * segment endpoint x = 10000
     *
     * circle starts at x = 10000.
     */
    assert.deepEqual(
      query({
        circleX:
          11000n,

        radius:
          1000n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          1n,
      }
    );
  }
);


test(
  "interior tangent returns exact rational parameter",
  () => {
    /*
     * Horizontal segment and tangent circle:
     *
     * closest point at x=5000,
     * therefore t=1/2.
     *
     * discriminant = 0.
     */
    assert.deepEqual(
      query({
        circleY:
          1000n,

        radius:
          1000n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          2n,
      }
    );
  }
);


test(
  "generic irrational entry remains quadratic lower root",
  () => {
    /*
     * Segment:
     *   (0,0) -> (10,0)
     *
     * Circle:
     *   center (5,1)
     *   radius 2
     *
     * Coefficients:
     *
     *   A = 100
     *   B = -100
     *   C = 22
     *   D = 1200
     *
     * t =
     *   (100 - sqrt(1200)) / 200
     */
    assert.deepEqual(
      segmentCircleEarliestContactParameterV1({
        startX:
          0n,

        startY:
          0n,

        endX:
          10n,

        endY:
          0n,

        circleX:
          5n,

        circleY:
          1n,

        radius:
          2n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT,

        a:
          100n,

        b:
          -100n,

        discriminant:
          1200n,
      }
    );
  }
);


test(
  "diagonal perfect-square entry canonicalizes exactly",
  () => {
    /*
     * Segment:
     *   (0,0) -> (6,8)
     *
     * Circle center lies on segment at:
     *   (3,4)
     *
     * radius = 1
     *
     * Segment length = 10.
     *
     * first contact is one world unit before midpoint,
     * therefore:
     *
     *   t = 4/10 = 2/5
     */
    assert.deepEqual(
      segmentCircleEarliestContactParameterV1({
        startX:
          0n,

        startY:
          0n,

        endX:
          6n,

        endY:
          8n,

        circleX:
          3n,

        circleY:
          4n,

        radius:
          1n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          2n,

        denominator:
          5n,
      }
    );
  }
);


test(
  "reversing segment produces complementary first contact in symmetric axial case",
  () => {
    const forward =
      query();

    const reverse =
      segmentCircleEarliestContactParameterV1({
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
          0n,

        radius:
          1000n,
      });

    assert.deepEqual(
      forward,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          2n,

        denominator:
          5n,
      }
    );

    assert.deepEqual(
      reverse,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          2n,

        denominator:
          5n,
      }
    );
  }
);


test(
  "negative world coordinates preserve exact entry parameter",
  () => {
    assert.deepEqual(
      segmentCircleEarliestContactParameterV1({
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
          -5000n,

        radius:
          2000n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          2n,

        denominator:
          5n,
      }
    );
  }
);


test(
  "arbitrarily large translated coordinates preserve exact parameter",
  () => {
    const base =
      10n ** 100n;

    assert.deepEqual(
      segmentCircleEarliestContactParameterV1({
        startX:
          base,

        startY:
          -base,

        endX:
          base +
          10000n,

        endY:
          -base,

        circleX:
          base +
          5000n,

        circleY:
          -base,

        radius:
          1000n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          2n,

        denominator:
          5n,
      }
    );
  }
);


test(
  "returned contact parameter is frozen",
  () => {
    assert.ok(
      Object.isFrozen(
        query()
      )
    );
  }
);


test(
  "all coordinates must remain canonical BigInts",
  () => {
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
      assert.throws(
        () =>
          query({
            [field]:
              1,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_SEGMENT_CIRCLE_EARLIEST_CONTACT_PARAMETER_V1",
        }
      );
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
      ]
    ) {
      assert.throws(
        () =>
          query({
            radius,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_SEGMENT_CIRCLE_EARLIEST_CONTACT_PARAMETER_V1",
        }
      );
    }
  }
);


test(
  "near-start exact entry remains strictly above zero",
  () => {
    /*
     * Segment:
     *   x = 0 -> 10000
     *
     * Circle:
     *   center x = 1001
     *   radius = 1000
     *
     * earliest point:
     *   x = 1
     *
     * therefore:
     *   t = 1/10000
     */
    assert.deepEqual(
      query({
        circleX:
          1001n,

        circleY:
          0n,

        radius:
          1000n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          10000n,
      }
    );
  }
);


test(
  "near-end exact entry remains strictly below one",
  () => {
    /*
     * Circle left boundary is x = 9999.
     *
     * Therefore:
     *
     *   t = 9999/10000
     */
    assert.deepEqual(
      query({
        circleX:
          10999n,

        circleY:
          0n,

        radius:
          1000n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          9999n,

        denominator:
          10000n,
      }
    );
  }
);


test(
  "exact endpoint-only contact remains canonical one",
  () => {
    assert.deepEqual(
      query({
        circleX:
          11000n,

        circleY:
          0n,

        radius:
          1000n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          1n,
      }
    );
  }
);


test(
  "diagonal tangent returns exact interior contact parameter",
  () => {
    /*
     * Segment:
     *
     *   (0,0) -> (8000,6000)
     *
     * D = (8000,6000)
     * |D|² = 100,000,000
     *
     * Circle:
     *
     *   center = (1600,6200)
     *   radius = 4000
     *
     * This is the already-locked exact 3-4-5-style
     * tangent geometry from SegmentCircleContactV1.
     *
     * Projection:
     *
     *   1600*8000 + 6200*6000
     *   = 50,000,000
     *
     * therefore tangent parameter:
     *
     *   t = 1/2
     */
    assert.deepEqual(
      segmentCircleEarliestContactParameterV1({
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
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          2n,
      }
    );
  }
);
