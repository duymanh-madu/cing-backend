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
  segmentClosedAabbExitContactParameterV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySegmentClosedAabbExitContactParameterV1"
  );


function query(
  overrides = {}
) {
  return segmentClosedAabbExitContactParameterV1({
    startX:
      overrides.startX ??
      1500n,

    startY:
      overrides.startY ??
      1500n,

    endX:
      overrides.endX ??
      1500n,

    endY:
      overrides.endY ??
      1500n,

    minX:
      overrides.minX ??
      1000n,

    minY:
      overrides.minY ??
      1000n,

    maxX:
      overrides.maxX ??
      2000n,

    maxY:
      overrides.maxY ??
      2000n,
  });
}


test(
  "segment remaining inside closed AABB has no exit",
  () => {
    assert.equal(
      query({
        endX:
          1800n,

        endY:
          1700n,
      }),
      null
    );
  }
);


test(
  "endpoint on closed boundary has no exit",
  () => {
    assert.equal(
      query({
        endX:
          2000n,
      }),
      null
    );
  }
);


test(
  "positive horizontal exit returns exact rational upper bound",
  () => {
    assert.deepEqual(
      query({
        endX:
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
  "negative horizontal exit returns exact rational upper bound",
  () => {
    assert.deepEqual(
      query({
        endX:
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
  "positive vertical exit returns exact rational upper bound",
  () => {
    assert.deepEqual(
      query({
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
  "negative vertical exit returns exact rational upper bound",
  () => {
    assert.deepEqual(
      query({
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
  "diagonal exit chooses exact minimum axis-exit parameter",
  () => {
    /*
     * X:
     *
     *   start 1500
     *   maxX  2000
     *   dx    1500
     *
     *   tx = 500/1500 = 1/3
     *
     * Y:
     *
     *   start 1500
     *   maxY  2000
     *   dy    1000
     *
     *   ty = 500/1000 = 1/2
     *
     * First world/AABB exit is min(1/3,1/2).
     */
    assert.deepEqual(
      query({
        endX:
          3000n,

        endY:
          2500n,
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
  "reversed diagonal chooses opposite slab exactly",
  () => {
    assert.deepEqual(
      query({
        startX:
          1500n,

        startY:
          1500n,

        endX:
          0n,

        endY:
          500n,
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
  "start on max boundary moving outward exits at canonical zero",
  () => {
    assert.deepEqual(
      query({
        startX:
          2000n,

        endX:
          3000n,
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
  "start on min boundary moving outward exits at canonical zero",
  () => {
    assert.deepEqual(
      query({
        startX:
          1000n,

        endX:
          0n,
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
  "start on boundary moving inward and ending inside has no exit",
  () => {
    assert.equal(
      query({
        startX:
          1000n,

        endX:
          1500n,
      }),
      null
    );
  }
);


test(
  "start on one boundary can enter then exit through opposite boundary",
  () => {
    assert.deepEqual(
      query({
        startX:
          1000n,

        endX:
          3000n,
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
  "parallel axis does not tighten exit",
  () => {
    assert.deepEqual(
      query({
        startX:
          1500n,

        endX:
          1500n,

        endY:
          3500n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          4n,
      }
    );
  }
);


test(
  "stationary point inside has no exit",
  () => {
    assert.equal(
      query(),
      null
    );
  }
);


test(
  "start outside fails closed",
  () => {
    assert.throws(
      () =>
        query({
          startX:
            500n,

          endX:
            1500n,
        }),
      {
        code:
          "CING_ARTILLERY_SEGMENT_CLOSED_AABB_EXIT_START_OUTSIDE_V1",
      }
    );
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
          "CING_ARTILLERY_INVALID_SEGMENT_CLOSED_AABB_EXIT_CONTACT_V1",
      }
    );
  }
);


test(
  "coordinate scalars must remain BigInt",
  () => {
    assert.throws(
      () =>
        query({
          endX:
            3000,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SEGMENT_CLOSED_AABB_EXIT_CONTACT_V1",
      }
    );
  }
);


test(
  "arbitrarily large translated geometry preserves exact exit parameter",
  () => {
    const base =
      10n ** 100n;


    assert.deepEqual(
      segmentClosedAabbExitContactParameterV1({
        startX:
          base +
          1500n,

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
  "returned exit parameter is frozen",
  () => {
    const result =
      query({
        endX:
          3000n,
      });


    assert.ok(
      Object.isFrozen(
        result
      )
    );
  }
);


test(
  "near-equal axis exit fractions choose exact smaller value",
  () => {
    /*
     * X exit:
     *
     *   1000 / 3000 = 1/3
     *
     * Y exit:
     *
     *   1000 / 3001
     *
     * Exact first exit is Y because:
     *
     *   1000/3001 < 1/3
     */
    assert.deepEqual(
      segmentClosedAabbExitContactParameterV1({
        startX:
          1000n,

        startY:
          1000n,

        endX:
          4000n,

        endY:
          4001n,

        minX:
          0n,

        minY:
          0n,

        maxX:
          2000n,

        maxY:
          2000n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1000n,

        denominator:
          3001n,
      }
    );
  }
);


test(
  "near-equal axis exit ordering reverses exactly when deltas reverse",
  () => {
    assert.deepEqual(
      segmentClosedAabbExitContactParameterV1({
        startX:
          1000n,

        startY:
          1000n,

        endX:
          4001n,

        endY:
          4000n,

        minX:
          0n,

        minY:
          0n,

        maxX:
          2000n,

        maxY:
          2000n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1000n,

        denominator:
          3001n,
      }
    );
  }
);
