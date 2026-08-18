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
  segmentClosedAabbEarliestContactParameterV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySegmentClosedAabbEarliestContactParameterV1"
  );

const {
  segmentIntersectsClosedAabbV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySegmentRoundedPixelCellContactV1"
  );


function query(
  overrides =
    {}
) {
  return segmentClosedAabbEarliestContactParameterV1({
    startX:
      0n,

    startY:
      1500n,

    endX:
      3000n,

    endY:
      1500n,

    minX:
      1000n,

    minY:
      1000n,

    maxX:
      2000n,

    maxY:
      2000n,

    ...overrides,
  });
}


test(
  "horizontal slab entry returns exact rational parameter",
  () => {
    assert.deepEqual(
      query(),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          3n,
      }
    );
  }
);


test(
  "vertical slab entry returns exact rational parameter",
  () => {
    assert.deepEqual(
      query({
        startX:
          1500n,

        startY:
          0n,

        endX:
          1500n,

        endY:
          3000n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          3n,
      }
    );
  }
);


test(
  "start inside closed AABB returns canonical zero",
  () => {
    assert.deepEqual(
      query({
        startX:
          1500n,

        startY:
          1500n,
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
  "start on closed AABB boundary returns canonical zero",
  () => {
    assert.deepEqual(
      query({
        startX:
          1000n,

        startY:
          1500n,
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
  "endpoint-only AABB contact returns canonical one",
  () => {
    assert.deepEqual(
      query({
        startX:
          0n,

        startY:
          0n,

        endX:
          1000n,

        endY:
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
  "one lattice unit before corner endpoint returns null",
  () => {
    assert.equal(
      query({
        startX:
          0n,

        startY:
          0n,

        endX:
          999n,

        endY:
          999n,
      }),
      null
    );
  }
);


test(
  "parallel segment outside slab returns null",
  () => {
    assert.equal(
      query({
        startX:
          0n,

        startY:
          999n,

        endX:
          3000n,

        endY:
          999n,
      }),
      null
    );
  }
);


test(
  "parallel segment on closed slab boundary returns exact entry",
  () => {
    assert.deepEqual(
      query({
        startX:
          0n,

        startY:
          1000n,

        endX:
          3000n,

        endY:
          1000n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          3n,
      }
    );
  }
);


test(
  "negative horizontal delta enters through maxX exactly",
  () => {
    assert.deepEqual(
      query({
        startX:
          3000n,

        startY:
          1500n,

        endX:
          0n,

        endY:
          1500n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          3n,
      }
    );
  }
);


test(
  "negative vertical delta enters through maxY exactly",
  () => {
    assert.deepEqual(
      query({
        startX:
          1500n,

        startY:
          3000n,

        endX:
          1500n,

        endY:
          0n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          3n,
      }
    );
  }
);


test(
  "both negative deltas choose exact maximum axis-entry bound",
  () => {
    /*
     * Segment:
     *
     *   (4000,5000) -> (0,0)
     *
     * X enters through maxX=2000:
     *
     *   t = (4000-2000)/4000 = 1/2
     *
     * Y enters through maxY=2000:
     *
     *   t = (5000-2000)/5000 = 3/5
     *
     * Earliest AABB contact requires both slabs:
     *
     *   max(1/2,3/5) = 3/5
     */
    assert.deepEqual(
      query({
        startX:
          4000n,

        startY:
          5000n,

        endX:
          0n,

        endY:
          0n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          3n,

        denominator:
          5n,
      }
    );
  }
);


test(
  "mixed deltas choose exact maximum rational entry",
  () => {
    /*
     * Segment:
     *
     *   (0,3500) -> (4000,0)
     *
     * X slab interval:
     *
     *   enter = 1000/4000 = 1/4
     *   exit  = 2000/4000 = 1/2
     *
     * Y moves downward in coordinate value and enters
     * through maxY=2000:
     *
     *   enter =
     *     (3500-2000)/3500
     *     = 3/7
     *
     *   exit =
     *     (3500-1000)/3500
     *     = 5/7
     *
     * Common interval:
     *
     *   [3/7, 1/2]
     *
     * therefore earliest common slab time:
     *
     *   max(1/4,3/7) = 3/7
     */
    assert.deepEqual(
      query({
        startX:
          0n,

        startY:
          3500n,

        endX:
          4000n,

        endY:
          0n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          3n,

        denominator:
          7n,
      }
    );
  }
);


test(
  "intersection entirely before t zero returns null",
  () => {
    assert.equal(
      query({
        startX:
          3000n,

        startY:
          1500n,

        endX:
          4000n,

        endY:
          1500n,
      }),
      null
    );
  }
);


test(
  "intersection entirely after t one returns null",
  () => {
    assert.equal(
      query({
        startX:
          0n,

        startY:
          1500n,

        endX:
          500n,

        endY:
          1500n,
      }),
      null
    );
  }
);


test(
  "stationary point inside returns zero",
  () => {
    assert.deepEqual(
      query({
        startX:
          1500n,

        startY:
          1500n,

        endX:
          1500n,

        endY:
          1500n,
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
  "stationary point outside returns null",
  () => {
    assert.equal(
      query({
        startX:
          500n,

        startY:
          500n,

        endX:
          500n,

        endY:
          500n,
      }),
      null
    );
  }
);


test(
  "large BigInt translated coordinates preserve exact parameter",
  () => {
    const base =
      10n ** 100n;

    assert.deepEqual(
      segmentClosedAabbEarliestContactParameterV1({
        startX:
          base,

        startY:
          -base +
          1500n,

        endX:
          base +
          3000n,

        endY:
          -base +
          1500n,

        minX:
          base +
          1000n,

        minY:
          -base +
          1000n,

        maxX:
          base +
          2000n,

        maxY:
          -base +
          2000n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          3n,
      }
    );
  }
);


test(
  "returned parameter is frozen",
  () => {
    assert.ok(
      Object.isFrozen(
        query()
      )
    );
  }
);


test(
  "invalid coordinate scalar fails closed",
  () => {
    const fields = [
      "startX",
      "startY",
      "endX",
      "endY",
      "minX",
      "minY",
      "maxX",
      "maxY",
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
            "CING_ARTILLERY_INVALID_SEGMENT_CLOSED_AABB_EARLIEST_CONTACT_V1",
        }
      );
    }
  }
);


test(
  "invalid AABB ordering fails closed",
  () => {
    assert.throws(
      () =>
        query({
          minX:
            2001n,

          maxX:
            2000n,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SEGMENT_CLOSED_AABB_EARLIEST_CONTACT_V1",
      }
    );

    assert.throws(
      () =>
        query({
          minY:
            2001n,

          maxY:
            2000n,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SEGMENT_CLOSED_AABB_EARLIEST_CONTACT_V1",
      }
    );
  }
);


test(
  "nullability remains equivalent to locked boolean closed-AABB authority",
  () => {
    const fixtures = [
      {
        startX:
          0n,

        startY:
          1500n,

        endX:
          3000n,

        endY:
          1500n,
      },
      {
        startX:
          0n,

        startY:
          999n,

        endX:
          3000n,

        endY:
          999n,
      },
      {
        startX:
          3000n,

        startY:
          1500n,

        endX:
          0n,

        endY:
          1500n,
      },
      {
        startX:
          0n,

        startY:
          0n,

        endX:
          1000n,

        endY:
          1000n,
      },
      {
        startX:
          0n,

        startY:
          0n,

        endX:
          999n,

        endY:
          999n,
      },
    ];

    for (
      const fixture
      of fixtures
    ) {
      const input = {
        ...fixture,

        minX:
          1000n,

        minY:
          1000n,

        maxX:
          2000n,

        maxY:
          2000n,
      };

      const booleanContact =
        segmentIntersectsClosedAabbV1(
          input
        );

      const parameter =
        segmentClosedAabbEarliestContactParameterV1(
          input
        );

      assert.equal(
        parameter !== null,
        booleanContact
      );
    }
  }
);


test(
  "near-equal axis entry fractions with different denominators choose exact larger entry",
  () => {
    /*
     * AABB:
     *
     *   X,Y in [1000,2000]
     *
     * Segment starts below-left and moves up-right:
     *
     *   start = (0,0)
     *   end   = (3001,3000)
     *
     * X entry:
     *
     *   1000/3001
     *
     * Y entry:
     *
     *   1000/3000 = 1/3
     *
     * They are extremely close, but:
     *
     *   1000/3001 < 1000/3000
     *
     * exactly because:
     *
     *   1000*3000 < 1000*3001
     *
     * Therefore the common AABB entry must be:
     *
     *   1/3
     *
     * This proves max(tEnterX,tEnterY) is selected by
     * exact cross multiplication rather than truncation.
     */
    assert.deepEqual(
      segmentClosedAabbEarliestContactParameterV1({
        startX:
          0n,

        startY:
          0n,

        endX:
          3001n,

        endY:
          3000n,

        minX:
          1000n,

        minY:
          1000n,

        maxX:
          2000n,

        maxY:
          2000n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          3n,
      }
    );
  }
);


test(
  "near-equal axis entry ordering reverses exactly when denominators reverse",
  () => {
    /*
     * Swap trajectory deltas:
     *
     * X entry:
     *   1000/3000 = 1/3
     *
     * Y entry:
     *   1000/3001
     *
     * Exact maximum remains 1/3, now owned by X.
     */
    assert.deepEqual(
      segmentClosedAabbEarliestContactParameterV1({
        startX:
          0n,

        startY:
          0n,

        endX:
          3000n,

        endY:
          3001n,

        minX:
          1000n,

        minY:
          1000n,

        maxX:
          2000n,

        maxY:
          2000n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          3n,
      }
    );
  }
);
