"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  segmentIntersectsClosedAabbV1,
  segmentIntersectsRoundedPixelCellV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySegmentRoundedPixelCellContactV1"
  );


function query(
  overrides = {}
) {
  return segmentIntersectsRoundedPixelCellV1({
    startXScaled:
      0n,

    startYScaled:
      1500n,

    endXScaled:
      4000n,

    endYScaled:
      1500n,

    radiusScaled:
      250n,

    cellX:
      1n,

    cellY:
      1n,

    physicsFixedScale:
      1000,

    ...overrides,
  });
}


test(
  "segment crossing expanded cell horizontal strip contacts",
  () => {
    assert.equal(
      query(),
      true
    );
  }
);


test(
  "segment crossing expanded cell vertical strip contacts",
  () => {
    assert.equal(
      query({
        startXScaled:
          1500n,

        startYScaled:
          0n,

        endXScaled:
          1500n,

        endYScaled:
          4000n,
      }),
      true
    );
  }
);


test(
  "exact tangent to expanded top edge contacts",
  () => {
    assert.equal(
      query({
        startYScaled:
          750n,

        endYScaled:
          750n,
      }),
      true
    );
  }
);


test(
  "one scaled unit beyond expanded top edge misses",
  () => {
    assert.equal(
      query({
        startYScaled:
          749n,

        endYScaled:
          749n,
      }),
      false
    );
  }
);


test(
  "corner-circle exact tangent contacts",
  () => {
    /*
     * Cell top-left corner = (1000,1000)
     *
     * Horizontal segment y=750 is tangent to radius 250
     * at x=1000.
     */
    assert.equal(
      query({
        startXScaled:
          500n,

        startYScaled:
          750n,

        endXScaled:
          1000n,

        endYScaled:
          750n,
      }),
      true
    );
  }
);


test(
  "expanded AABB corner false-positive is rejected by rounded geometry",
  () => {
    /*
     * Expanded AABB includes (751,751) for radius=250.
     *
     * Distance to cell corner (1000,1000):
     *
     * dx = -249
     * dy = -249
     *
     * 249² + 249² > 250²
     *
     * so the true rounded rectangle does NOT contain it.
     */
    assert.equal(
      query({
        startXScaled:
          751n,

        startYScaled:
          751n,

        endXScaled:
          751n,

        endYScaled:
          751n,
      }),
      false
    );
  }
);


test(
  "stationary point inside rounded corner region contacts",
  () => {
    assert.equal(
      query({
        startXScaled:
          850n,

        startYScaled:
          850n,

        endXScaled:
          850n,

        endYScaled:
          850n,
      }),
      true
    );
  }
);


test(
  "between-endpoint terrain tunneling is detected",
  () => {
    assert.equal(
      query({
        startXScaled:
          0n,

        startYScaled:
          1500n,

        endXScaled:
          5000n,

        endYScaled:
          1500n,

        radiusScaled:
          10n,
      }),
      true
    );
  }
);


test(
  "reversing segment preserves rounded-cell contact result",
  () => {
    const forward =
      query({
        startXScaled:
          0n,

        endXScaled:
          4000n,

        startYScaled:
          800n,

        endYScaled:
          800n,
      });

    const reverse =
      query({
        startXScaled:
          4000n,

        endXScaled:
          0n,

        startYScaled:
          800n,

        endYScaled:
          800n,
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
  "negative pixel cells preserve exact geometry",
  () => {
    assert.equal(
      segmentIntersectsRoundedPixelCellV1({
        startXScaled:
          -3000n,

        startYScaled:
          -1500n,

        endXScaled:
          1000n,

        endYScaled:
          -1500n,

        radiusScaled:
          100n,

        cellX:
          -2n,

        cellY:
          -2n,

        physicsFixedScale:
          1000,
      }),
      true
    );
  }
);


test(
  "large BigInt world coordinates remain exact",
  () => {
    const base =
      10n ** 80n;

    assert.equal(
      segmentIntersectsRoundedPixelCellV1({
        startXScaled:
          base,

        startYScaled:
          base + 1500n,

        endXScaled:
          base + 4000n,

        endYScaled:
          base + 1500n,

        radiusScaled:
          250n,

        cellX:
          base / 1000n +
          1n,

        cellY:
          base / 1000n +
          1n,

        physicsFixedScale:
          1000,
      }),
      true
    );
  }
);


test(
  "closed AABB primitive handles exact tangent and rejection",
  () => {
    assert.equal(
      segmentIntersectsClosedAabbV1({
        startX:
          0n,

        startY:
          1000n,

        endX:
          2000n,

        endY:
          1000n,

        minX:
          500n,

        minY:
          1000n,

        maxX:
          1500n,

        maxY:
          2000n,
      }),
      true
    );

    assert.equal(
      segmentIntersectsClosedAabbV1({
        startX:
          0n,

        startY:
          999n,

        endX:
          2000n,

        endY:
          999n,

        minX:
          500n,

        minY:
          1000n,

        maxX:
          1500n,

        maxY:
          2000n,
      }),
      false
    );
  }
);


test(
  "rounded-cell inputs must remain canonical",
  () => {
    assert.throws(
      () =>
        query({
          startXScaled:
            1,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SEGMENT_ROUNDED_PIXEL_CELL_CONTACT_V1",
      }
    );

    assert.throws(
      () =>
        query({
          cellX:
            1,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SEGMENT_ROUNDED_PIXEL_CELL_CONTACT_V1",
      }
    );

    assert.throws(
      () =>
        query({
          radiusScaled:
            0n,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SEGMENT_ROUNDED_PIXEL_CELL_CONTACT_V1",
      }
    );

    assert.throws(
      () =>
        query({
          physicsFixedScale:
            0,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SEGMENT_ROUNDED_PIXEL_CELL_CONTACT_V1",
      }
    );
  }
);


test(
  "closed AABB works with negative horizontal delta",
  () => {
    assert.equal(
      segmentIntersectsClosedAabbV1({
        startX:
          3000n,

        startY:
          1500n,

        endX:
          0n,

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
      }),
      true
    );
  }
);


test(
  "closed AABB works with negative vertical delta",
  () => {
    assert.equal(
      segmentIntersectsClosedAabbV1({
        startX:
          1500n,

        startY:
          3000n,

        endX:
          1500n,

        endY:
          0n,

        minX:
          1000n,

        minY:
          1000n,

        maxX:
          2000n,

        maxY:
          2000n,
      }),
      true
    );
  }
);


test(
  "closed AABB works with both deltas negative",
  () => {
    assert.equal(
      segmentIntersectsClosedAabbV1({
        startX:
          3000n,

        startY:
          3000n,

        endX:
          0n,

        endY:
          0n,

        minX:
          1000n,

        minY:
          1000n,

        maxX:
          2000n,

        maxY:
          2000n,
      }),
      true
    );
  }
);


test(
  "AABB intersection entirely before segment parameter zero is rejected",
  () => {
    assert.equal(
      segmentIntersectsClosedAabbV1({
        startX:
          3000n,

        startY:
          1500n,

        endX:
          4000n,

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
      }),
      false
    );
  }
);


test(
  "AABB intersection entirely after segment parameter one is rejected",
  () => {
    assert.equal(
      segmentIntersectsClosedAabbV1({
        startX:
          0n,

        startY:
          1500n,

        endX:
          500n,

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
      }),
      false
    );
  }
);


test(
  "parallel segment outside slab is rejected",
  () => {
    assert.equal(
      segmentIntersectsClosedAabbV1({
        startX:
          0n,

        startY:
          999n,

        endX:
          3000n,

        endY:
          999n,

        minX:
          1000n,

        minY:
          1000n,

        maxX:
          2000n,

        maxY:
          2000n,
      }),
      false
    );
  }
);


test(
  "parallel segment on closed slab boundary contacts",
  () => {
    assert.equal(
      segmentIntersectsClosedAabbV1({
        startX:
          0n,

        startY:
          1000n,

        endX:
          3000n,

        endY:
          1000n,

        minX:
          1000n,

        minY:
          1000n,

        maxX:
          2000n,

        maxY:
          2000n,
      }),
      true
    );
  }
);


test(
  "AABB corner contact at exact segment endpoint counts",
  () => {
    assert.equal(
      segmentIntersectsClosedAabbV1({
        startX:
          0n,

        startY:
          0n,

        endX:
          1000n,

        endY:
          1000n,

        minX:
          1000n,

        minY:
          1000n,

        maxX:
          2000n,

        maxY:
          2000n,
      }),
      true
    );
  }
);


test(
  "one lattice unit before AABB corner endpoint does not contact",
  () => {
    assert.equal(
      segmentIntersectsClosedAabbV1({
        startX:
          0n,

        startY:
          0n,

        endX:
          999n,

        endY:
          999n,

        minX:
          1000n,

        minY:
          1000n,

        maxX:
          2000n,

        maxY:
          2000n,
      }),
      false
    );
  }
);


test(
  "closed AABB result is invariant under segment reversal",
  () => {
    const forward =
      segmentIntersectsClosedAabbV1({
        startX:
          -5000n,

        startY:
          2750n,

        endX:
          7000n,

        endY:
          -1250n,

        minX:
          1000n,

        minY:
          1000n,

        maxX:
          2000n,

        maxY:
          2000n,
      });

    const reverse =
      segmentIntersectsClosedAabbV1({
        startX:
          7000n,

        startY:
          -1250n,

        endX:
          -5000n,

        endY:
          2750n,

        minX:
          1000n,

        minY:
          1000n,

        maxX:
          2000n,

        maxY:
          2000n,
      });

    assert.equal(
      reverse,
      forward
    );
  }
);
