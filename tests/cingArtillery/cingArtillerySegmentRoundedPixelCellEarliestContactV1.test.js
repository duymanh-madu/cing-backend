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
  segmentRoundedPixelCellEarliestContactV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySegmentRoundedPixelCellEarliestContactV1"
  );

const {
  segmentIntersectsRoundedPixelCellV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySegmentRoundedPixelCellContactV1"
  );


function query(
  overrides =
    {}
) {
  return segmentRoundedPixelCellEarliestContactV1({
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
  "vertical-strip expansion supplies earliest rational contact",
  () => {
    /*
     * Cell:
     *
     *   [1000,2000] x [1000,2000]
     *
     * radius = 250
     *
     * Horizontal trajectory y=1500.
     *
     * Vertical strip begins at:
     *
     *   x = 1000 - 250 = 750
     *
     * Segment length:
     *
     *   4000
     *
     * therefore:
     *
     *   t = 750/4000 = 3/16
     */
    assert.deepEqual(
      query(),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          3n,

        denominator:
          16n,
      }
    );
  }
);


test(
  "horizontal-strip expansion supplies earliest rational contact for vertical motion",
  () => {
    assert.deepEqual(
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
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          3n,

        denominator:
          16n,
      }
    );
  }
);


test(
  "corner-circle irrational contact can beat rational strip entry exactly",
  () => {
    /*
     * Horizontal trajectory:
     *
     *   y = 751
     *
     * Cell top-left corner:
     *
     *   (1000,1000)
     *
     * radius:
     *
     *   250
     *
     * Vertical offset from corner:
     *
     *   249
     *
     * Circle entry:
     *
     *   x =
     *     1000 - sqrt(250² - 249²)
     *
     *     = 1000 - sqrt(499)
     *
     * which is irrational and strictly before the
     * horizontal strip entry x=1000.
     *
     * Segment:
     *
     *   (0,751) -> (4000,751)
     *
     * Exact circle coefficients:
     *
     *   A = 16,000,000
     *   B = -8,000,000
     *   D = 31,936,000,000
     */
    assert.deepEqual(
      query({
        startYScaled:
          751n,

        endYScaled:
          751n,
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT,

        a:
          16000000n,

        b:
          -8000000n,

        discriminant:
          31936000000n,
      }
    );
  }
);


test(
  "exact corner tangent and strip boundary agree on rational contact",
  () => {
    /*
     * y=750 is exactly radius 250 above top-left corner.
     *
     * Corner tangent occurs at x=1000.
     * Horizontal strip also begins at x=1000.
     *
     * Both therefore produce exact t=1/4.
     */
    assert.deepEqual(
      query({
        startYScaled:
          750n,

        endYScaled:
          750n,
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
  "one scaled unit outside rounded top boundary returns null",
  () => {
    assert.equal(
      query({
        startYScaled:
          749n,

        endYScaled:
          749n,
      }),
      null
    );
  }
);


test(
  "expanded AABB corner false-positive remains rejected",
  () => {
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
      null
    );
  }
);


test(
  "stationary point inside rounded geometry returns canonical zero",
  () => {
    assert.deepEqual(
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
  "start inside cell returns canonical zero",
  () => {
    assert.deepEqual(
      query({
        startXScaled:
          1500n,

        startYScaled:
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
  "corner tangent exactly at segment end returns canonical one",
  () => {
    assert.deepEqual(
      query({
        startXScaled:
          0n,

        startYScaled:
          750n,

        endXScaled:
          1000n,

        endYScaled:
          750n,
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
  "one lattice unit before endpoint-only tangent returns null",
  () => {
    assert.equal(
      query({
        startXScaled:
          0n,

        startYScaled:
          750n,

        endXScaled:
          999n,

        endYScaled:
          750n,
      }),
      null
    );
  }
);


test(
  "negative pixel cells preserve exact earliest parameter",
  () => {
    const result =
      segmentRoundedPixelCellEarliestContactV1({
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
      });

    assert.notEqual(
      result,
      null
    );
  }
);


test(
  "large BigInt translated world geometry preserves exact earliest parameter",
  () => {
    const base =
      10n ** 80n;

    const translated =
      segmentRoundedPixelCellEarliestContactV1({
        startXScaled:
          base,

        startYScaled:
          base +
          1500n,

        endXScaled:
          base +
          4000n,

        endYScaled:
          base +
          1500n,

        radiusScaled:
          250n,

        cellX:
          base /
            1000n +
          1n,

        cellY:
          base /
            1000n +
          1n,

        physicsFixedScale:
          1000,
      });

    assert.deepEqual(
      translated,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          3n,

        denominator:
          16n,
      }
    );
  }
);


test(
  "returned earliest parameter is frozen",
  () => {
    assert.ok(
      Object.isFrozen(
        query()
      )
    );
  }
);


test(
  "invalid canonical inputs fail closed through locked boolean authority",
  () => {
    const invalidCases = [
      {
        startXScaled:
          1,
      },
      {
        startYScaled:
          "0",
      },
      {
        endXScaled:
          null,
      },
      {
        endYScaled:
          undefined,
      },
      {
        radiusScaled:
          0n,
      },
      {
        radiusScaled:
          -1n,
      },
      {
        cellX:
          1,
      },
      {
        cellY:
          "1",
      },
      {
        physicsFixedScale:
          0,
      },
      {
        physicsFixedScale:
          1n,
      },
    ];

    for (
      const overrides
      of invalidCases
    ) {
      assert.throws(
        () =>
          query(
            overrides
          ),
        {
          code:
            "CING_ARTILLERY_INVALID_SEGMENT_ROUNDED_PIXEL_CELL_CONTACT_V1",
        }
      );
    }
  }
);


test(
  "nullability remains equivalent to locked boolean rounded-cell authority",
  () => {
    const fixtures = [
      {},
      {
        startYScaled:
          750n,

        endYScaled:
          750n,
      },
      {
        startYScaled:
          749n,

        endYScaled:
          749n,
      },
      {
        startYScaled:
          751n,

        endYScaled:
          751n,
      },
      {
        startXScaled:
          751n,

        startYScaled:
          751n,

        endXScaled:
          751n,

        endYScaled:
          751n,
      },
      {
        startXScaled:
          850n,

        startYScaled:
          850n,

        endXScaled:
          850n,

        endYScaled:
          850n,
      },
    ];


    for (
      const overrides
      of fixtures
    ) {
      const input = {
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
      };

      const booleanContact =
        segmentIntersectsRoundedPixelCellV1(
          input
        );

      const parameter =
        segmentRoundedPixelCellEarliestContactV1(
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
  "exact minimum is independent of six-candidate ordering",
  () => {
    const {
      segmentClosedAabbEarliestContactParameterV1,
    } =
      require(
        "../../services/games/cingArtillery/domain/cingArtillerySegmentClosedAabbEarliestContactParameterV1"
      );

    const {
      segmentCircleEarliestContactParameterV1,
    } =
      require(
        "../../services/games/cingArtillery/domain/cingArtillerySegmentCircleEarliestContactParameterV1"
      );

    const {
      compareContactParametersV1,
    } =
      require(
        "../../services/games/cingArtillery/domain/cingArtilleryContactParameterComparatorV1"
      );


    const input = {
      startXScaled:
        0n,

      startYScaled:
        751n,

      endXScaled:
        4000n,

      endYScaled:
        751n,

      radiusScaled:
        250n,

      cellX:
        1n,

      cellY:
        1n,

      physicsFixedScale:
        1000,
    };


    const scale =
      1000n;

    const minX =
      1000n;

    const minY =
      1000n;

    const maxX =
      2000n;

    const maxY =
      2000n;


    const candidates = [
      segmentClosedAabbEarliestContactParameterV1({
        startX:
          input.startXScaled,

        startY:
          input.startYScaled,

        endX:
          input.endXScaled,

        endY:
          input.endYScaled,

        minX,

        minY:
          minY -
          input.radiusScaled,

        maxX,

        maxY:
          maxY +
          input.radiusScaled,
      }),

      segmentClosedAabbEarliestContactParameterV1({
        startX:
          input.startXScaled,

        startY:
          input.startYScaled,

        endX:
          input.endXScaled,

        endY:
          input.endYScaled,

        minX:
          minX -
          input.radiusScaled,

        minY,

        maxX:
          maxX +
          input.radiusScaled,

        maxY,
      }),

      segmentCircleEarliestContactParameterV1({
        startX:
          input.startXScaled,

        startY:
          input.startYScaled,

        endX:
          input.endXScaled,

        endY:
          input.endYScaled,

        circleX:
          minX,

        circleY:
          minY,

        radius:
          input.radiusScaled,
      }),

      segmentCircleEarliestContactParameterV1({
        startX:
          input.startXScaled,

        startY:
          input.startYScaled,

        endX:
          input.endXScaled,

        endY:
          input.endYScaled,

        circleX:
          maxX,

        circleY:
          minY,

        radius:
          input.radiusScaled,
      }),

      segmentCircleEarliestContactParameterV1({
        startX:
          input.startXScaled,

        startY:
          input.startYScaled,

        endX:
          input.endXScaled,

        endY:
          input.endYScaled,

        circleX:
          minX,

        circleY:
          maxY,

        radius:
          input.radiusScaled,
      }),

      segmentCircleEarliestContactParameterV1({
        startX:
          input.startXScaled,

        startY:
          input.startYScaled,

        endX:
          input.endXScaled,

        endY:
          input.endYScaled,

        circleX:
          maxX,

        circleY:
          maxY,

        radius:
          input.radiusScaled,
      }),
    ];


    assert.equal(
      scale,
      BigInt(
        input.physicsFixedScale
      )
    );


    const expected =
      segmentRoundedPixelCellEarliestContactV1(
        input
      );


    function reduceMinimum(
      orderedCandidates
    ) {
      let earliest =
        null;

      for (
        const candidate
        of orderedCandidates
      ) {
        if (
          candidate === null
        ) {
          continue;
        }

        if (
          earliest === null ||
          compareContactParametersV1(
            candidate,
            earliest
          ) < 0
        ) {
          earliest =
            candidate;
        }
      }

      return earliest;
    }


    function permutations(
      values
    ) {
      if (
        values.length <= 1
      ) {
        return [
          values,
        ];
      }

      const result =
        [];

      for (
        let index =
          0;

        index <
        values.length;

        index +=
          1
      ) {
        const head =
          values[index];

        const tail =
          values.slice(
            0,
            index
          ).concat(
            values.slice(
              index +
              1
            )
          );

        for (
          const permutation
          of permutations(
            tail
          )
        ) {
          result.push([
            head,
            ...permutation,
          ]);
        }
      }

      return result;
    }


    const allOrders =
      permutations(
        candidates
      );


    assert.equal(
      allOrders.length,
      720
    );


    for (
      const orderedCandidates
      of allOrders
    ) {
      assert.deepEqual(
        reduceMinimum(
          orderedCandidates
        ),
        expected
      );
    }


    assert.equal(
      expected.kind,
      CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT
    );
  }
);


test(
  "exact-equal strip and corner candidates remain value-order independent",
  () => {
    const {
      segmentClosedAabbEarliestContactParameterV1,
    } =
      require(
        "../../services/games/cingArtillery/domain/cingArtillerySegmentClosedAabbEarliestContactParameterV1"
      );

    const {
      segmentCircleEarliestContactParameterV1,
    } =
      require(
        "../../services/games/cingArtillery/domain/cingArtillerySegmentCircleEarliestContactParameterV1"
      );

    const {
      compareContactParametersV1,
    } =
      require(
        "../../services/games/cingArtillery/domain/cingArtilleryContactParameterComparatorV1"
      );


    const strip =
      segmentClosedAabbEarliestContactParameterV1({
        startX:
          0n,

        startY:
          750n,

        endX:
          4000n,

        endY:
          750n,

        minX:
          1000n,

        minY:
          750n,

        maxX:
          2000n,

        maxY:
          2250n,
      });


    const corner =
      segmentCircleEarliestContactParameterV1({
        startX:
          0n,

        startY:
          750n,

        endX:
          4000n,

        endY:
          750n,

        circleX:
          1000n,

        circleY:
          1000n,

        radius:
          250n,
      });


    assert.deepEqual(
      strip,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          1n,

        denominator:
          4n,
      }
    );

    assert.deepEqual(
      corner,
      strip
    );

    assert.equal(
      compareContactParametersV1(
        strip,
        corner
      ),
      0
    );

    assert.equal(
      compareContactParametersV1(
        corner,
        strip
      ),
      0
    );


    const forwardMinimum =
      compareContactParametersV1(
        strip,
        corner
      ) <= 0
        ? strip
        : corner;

    const reversedMinimum =
      compareContactParametersV1(
        corner,
        strip
      ) <= 0
        ? corner
        : strip;


    assert.deepEqual(
      forwardMinimum,
      reversedMinimum
    );

    assert.deepEqual(
      segmentRoundedPixelCellEarliestContactV1({
        startXScaled:
          0n,

        startYScaled:
          750n,

        endXScaled:
          4000n,

        endYScaled:
          750n,

        radiusScaled:
          250n,

        cellX:
          1n,

        cellY:
          1n,

        physicsFixedScale:
          1000,
      }),
      forwardMinimum
    );
  }
);
