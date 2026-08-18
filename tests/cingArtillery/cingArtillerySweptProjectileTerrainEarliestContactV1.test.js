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
  sweptProjectileTerrainEarliestContactV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySweptProjectileTerrainEarliestContactV1"
  );

const {
  sweptProjectileIntersectsTerrainV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySweptProjectileTerrainContactV1"
  );

const {
  segmentRoundedPixelCellEarliestContactV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySegmentRoundedPixelCellEarliestContactV1"
  );

const {
  compareContactParametersV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryContactParameterComparatorV1"
  );


function makeMask({
  widthPx,
  heightPx,
  solidCells,
}) {
  const bytesPerRow =
    Math.floor(
      (widthPx + 7) /
      8
    );

  const mask =
    Buffer.alloc(
      bytesPerRow *
      heightPx
    );


  for (
    const [
      x,
      y,
    ]
    of solidCells
  ) {
    const byteOffset =
      y *
        bytesPerRow +
      Math.floor(
        x /
        8
      );

    const bitIndex =
      7 -
      (
        x %
        8
      );

    mask[byteOffset] |=
      1 <<
      bitIndex;
  }


  return mask;
}


function segment(
  overrides =
    {}
) {
  return Object.freeze({
    start_x_scaled:
      0n,

    start_y_scaled:
      1500n,

    end_x_scaled:
      5000n,

    end_y_scaled:
      1500n,

    ...overrides,
  });
}


function query(
  overrides =
    {}
) {
  const widthPx =
    overrides.widthPx ??
    6;

  const heightPx =
    overrides.heightPx ??
    4;

  const collisionMask =
    overrides.collisionMask ??
    makeMask({
      widthPx,
      heightPx,

      solidCells:
        [
          [2, 1],
        ],
    });


  return sweptProjectileTerrainEarliestContactV1({
    trajectorySegment:
      segment(),

    projectileRadiusScaled:
      100n,

    physicsFixedScale:
      1000,

    widthPx,
    heightPx,
    collisionMask,

    ...overrides,
  });
}


test(
  "single solid terrain cell returns exact rational earliest contact",
  () => {
    /*
     * Cell [2,1].
     *
     * Horizontal trajectory:
     *
     *   x = 0 -> 5000
     *   y = 1500
     *
     * radius=100.
     *
     * Expanded vertical strip starts at:
     *
     *   x = 2000 - 100 = 1900
     *
     * therefore:
     *
     *   t = 1900/5000 = 19/50
     */
    assert.deepEqual(
      query(),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          19n,

        denominator:
          50n,
      }
    );
  }
);


test(
  "empty terrain returns null",
  () => {
    assert.equal(
      query({
        collisionMask:
          makeMask({
            widthPx:
              6,

            heightPx:
              4,

            solidCells:
              [],
          }),
      }),
      null
    );
  }
);


test(
  "solid broad-phase candidate outside rounded narrow phase returns null",
  () => {
    assert.equal(
      query({
        trajectorySegment:
          segment({
            start_x_scaled:
              751n,

            start_y_scaled:
              751n,

            end_x_scaled:
              751n,

            end_y_scaled:
              751n,
          }),

        projectileRadiusScaled:
          250n,

        widthPx:
          5,

        heightPx:
          5,

        collisionMask:
          makeMask({
            widthPx:
              5,

            heightPx:
              5,

            solidCells:
              [
                [1, 1],
              ],
          }),
      }),
      null
    );
  }
);


test(
  "exact tangent to solid terrain returns exact contact parameter",
  () => {
    assert.deepEqual(
      query({
        trajectorySegment:
          segment({
            start_y_scaled:
              750n,

            end_y_scaled:
              750n,
          }),

        projectileRadiusScaled:
          250n,

        widthPx:
          5,

        heightPx:
          4,

        collisionMask:
          makeMask({
            widthPx:
              5,

            heightPx:
              4,

            solidCells:
              [
                [2, 1],
              ],
          }),
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
  "one lattice unit beyond terrain tangent returns null",
  () => {
    assert.equal(
      query({
        trajectorySegment:
          segment({
            start_y_scaled:
              749n,

            end_y_scaled:
              749n,
          }),

        projectileRadiusScaled:
          250n,

        widthPx:
          5,

        heightPx:
          4,

        collisionMask:
          makeMask({
            widthPx:
              5,

            heightPx:
              4,

            solidCells:
              [
                [2, 1],
              ],
          }),
      }),
      null
    );
  }
);


test(
  "projectile outside map can sweep into edge terrain",
  () => {
    const result =
      query({
        trajectorySegment:
          segment({
            start_x_scaled:
              -2000n,

            start_y_scaled:
              500n,

            end_x_scaled:
              -100n,

            end_y_scaled:
              500n,
          }),

        projectileRadiusScaled:
          100n,

        widthPx:
          2,

        heightPx:
          2,

        collisionMask:
          makeMask({
            widthPx:
              2,

            heightPx:
              2,

            solidCells:
              [
                [0, 0],
              ],
          }),
      });


    assert.notEqual(
      result,
      null
    );
  }
);


test(
  "candidate rectangle fully outside map returns null",
  () => {
    assert.equal(
      query({
        trajectorySegment:
          segment({
            start_x_scaled:
              -(10n ** 80n),

            start_y_scaled:
              -(10n ** 80n),

            end_x_scaled:
              -(10n ** 80n) +
              1000n,

            end_y_scaled:
              -(10n ** 80n) +
              1000n,
          }),

        projectileRadiusScaled:
          100n,

        widthPx:
          2,

        heightPx:
          2,

        collisionMask:
          makeMask({
            widthPx:
              2,

            heightPx:
              2,

            solidCells:
              [
                [0, 0],
              ],
          }),
      }),
      null
    );
  }
);


test(
  "reverse trajectory ignores row-major first-hit order and chooses geometric earliest cell",
  () => {
    /*
     * Row-major bitmask scan encounters:
     *
     *   cell [1,1]
     *
     * before:
     *
     *   cell [3,1]
     *
     * But projectile travels:
     *
     *   x = 5000 -> 0
     *
     * at y=1500 with radius=100.
     *
     * Cell [3,1] expanded right boundary:
     *
     *   x = 4000 + 100 = 4100
     *
     * so earliest contact:
     *
     *   (5000-4100)/5000
     *   = 900/5000
     *   = 9/50
     *
     * Cell [1,1] would not be reached until:
     *
     *   (5000-2100)/5000
     *   = 29/50
     *
     * Therefore "first solid cell in row-major scan" is
     * provably NOT collision precedence.
     */
    assert.deepEqual(
      query({
        trajectorySegment:
          segment({
            start_x_scaled:
              5000n,

            end_x_scaled:
              0n,
          }),

        collisionMask:
          makeMask({
            widthPx:
              6,

            heightPx:
              4,

            solidCells:
              [
                [1, 1],
                [3, 1],
              ],
          }),
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          9n,

        denominator:
          50n,
      }
    );
  }
);


test(
  "forward trajectory chooses opposite solid cell from reverse trajectory",
  () => {
    const mask =
      makeMask({
        widthPx:
          6,

        heightPx:
          4,

        solidCells:
          [
            [1, 1],
            [3, 1],
          ],
      });


    const forward =
      query({
        collisionMask:
          mask,
      });


    const reverse =
      query({
        trajectorySegment:
          segment({
            start_x_scaled:
              5000n,

            end_x_scaled:
              0n,
          }),

        collisionMask:
          mask,
      });


    assert.deepEqual(
      forward,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          9n,

        denominator:
          50n,
      }
    );

    assert.deepEqual(
      reverse,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          9n,

        denominator:
          50n,
      }
    );
  }
);


test(
  "global terrain minimum can remain irrational",
  () => {
    /*
     * y=751 with radius=250 reaches the rounded top corner
     * of cell [1,1] before its strip boundary.
     *
     * Keep another later solid cell in the same terrain so
     * global terrain selection must compare multiple cells
     * while preserving the irrational winner.
     */
    const result =
      query({
        trajectorySegment:
          segment({
            start_y_scaled:
              751n,

            end_y_scaled:
              751n,
          }),

        projectileRadiusScaled:
          250n,

        collisionMask:
          makeMask({
            widthPx:
              6,

            heightPx:
              4,

            solidCells:
              [
                [1, 1],
                [3, 1],
              ],
          }),
      });


    assert.notEqual(
      result,
      null
    );

    assert.equal(
      result.kind,
      CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT
    );
  }
);


test(
  "global result equals exact minimum of independently evaluated solid cells",
  () => {
    const trajectorySegment =
      segment({
        start_x_scaled:
          5000n,

        end_x_scaled:
          0n,
      });

    const cells = [
      [1n, 1n],
      [3n, 1n],
    ];


    const candidates =
      cells.map(
        (
          [
            cellX,
            cellY,
          ]
        ) =>
          segmentRoundedPixelCellEarliestContactV1({
            startXScaled:
              trajectorySegment
                .start_x_scaled,

            startYScaled:
              trajectorySegment
                .start_y_scaled,

            endXScaled:
              trajectorySegment
                .end_x_scaled,

            endYScaled:
              trajectorySegment
                .end_y_scaled,

            radiusScaled:
              100n,

            cellX,
            cellY,

            physicsFixedScale:
              1000,
          })
      );


    let expected =
      null;


    for (
      const candidate
      of candidates
    ) {
      if (
        candidate === null
      ) {
        continue;
      }

      if (
        expected === null ||
        compareContactParametersV1(
          candidate,
          expected
        ) < 0
      ) {
        expected =
          candidate;
      }
    }


    const actual =
      query({
        trajectorySegment,

        collisionMask:
          makeMask({
            widthPx:
              6,

            heightPx:
              4,

            solidCells:
              [
                [1, 1],
                [3, 1],
              ],
          }),
      });


    assert.deepEqual(
      actual,
      expected
    );
  }
);


test(
  "non-byte-aligned bitmask width preserves exact terrain earliest contact",
  () => {
    const result =
      sweptProjectileTerrainEarliestContactV1({
        trajectorySegment: {
          start_x_scaled:
            7000n,

          start_y_scaled:
            1500n,

          end_x_scaled:
            9500n,

          end_y_scaled:
            1500n,
        },

        projectileRadiusScaled:
          100n,

        physicsFixedScale:
          1000,

        widthPx:
          10,

        heightPx:
          2,

        collisionMask:
          makeMask({
            widthPx:
              10,

            heightPx:
              2,

            solidCells:
              [
                [8, 1],
              ],
          }),
      });


    assert.notEqual(
      result,
      null
    );
  }
);


test(
  "returned terrain contact parameter is frozen",
  () => {
    assert.ok(
      Object.isFrozen(
        query()
      )
    );
  }
);


test(
  "invalid bitmask fails closed",
  () => {
    assert.throws(
      () =>
        query({
          collisionMask:
            Buffer.alloc(
              0
            ),
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_TERRAIN_EARLIEST_BITMASK_V1",
      }
    );
  }
);


test(
  "trajectory coordinates must remain canonical BigInts",
  () => {
    assert.throws(
      () =>
        query({
          trajectorySegment:
            segment({
              start_x_scaled:
                1,
            }),
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_TERRAIN_EARLIEST_CONTACT_V1",
      }
    );
  }
);


test(
  "radius dimensions and scale must remain canonical",
  () => {
    const invalidCases = [
      {
        projectileRadiusScaled:
          0n,
      },

      {
        projectileRadiusScaled:
          1,
      },

      {
        physicsFixedScale:
          0,
      },

      {
        widthPx:
          0,
      },

      {
        heightPx:
          0,
      },
    ];


    for (
      const item
      of invalidCases
    ) {
      assert.throws(
        () =>
          query(
            item
          ),
        {
          code:
            "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_TERRAIN_EARLIEST_CONTACT_V1",
        }
      );
    }
  }
);


test(
  "nullability remains equivalent to locked boolean swept-terrain authority",
  () => {
    const cases = [
      {
        widthPx:
          6,

        heightPx:
          4,

        trajectorySegment:
          segment(),

        projectileRadiusScaled:
          100n,

        solidCells:
          [
            [2, 1],
          ],
      },

      {
        widthPx:
          6,

        heightPx:
          4,

        trajectorySegment:
          segment(),

        projectileRadiusScaled:
          100n,

        solidCells:
          [],
      },

      {
        widthPx:
          5,

        heightPx:
          4,

        trajectorySegment:
          segment({
            start_y_scaled:
              750n,

            end_y_scaled:
              750n,
          }),

        projectileRadiusScaled:
          250n,

        solidCells:
          [
            [2, 1],
          ],
      },

      {
        widthPx:
          5,

        heightPx:
          4,

        trajectorySegment:
          segment({
            start_y_scaled:
              749n,

            end_y_scaled:
              749n,
          }),

        projectileRadiusScaled:
          250n,

        solidCells:
          [
            [2, 1],
          ],
      },

      {
        widthPx:
          6,

        heightPx:
          4,

        trajectorySegment:
          segment({
            start_x_scaled:
              5000n,

            end_x_scaled:
              0n,
          }),

        projectileRadiusScaled:
          100n,

        solidCells:
          [
            [1, 1],
            [3, 1],
          ],
      },
    ];


    for (
      const item
      of cases
    ) {
      const collisionMask =
        makeMask({
          widthPx:
            item.widthPx,

          heightPx:
            item.heightPx,

          solidCells:
            item.solidCells,
        });


      const input = {
        trajectorySegment:
          item.trajectorySegment,

        projectileRadiusScaled:
          item.projectileRadiusScaled,

        physicsFixedScale:
          1000,

        widthPx:
          item.widthPx,

        heightPx:
          item.heightPx,

        collisionMask,
      };


      const booleanContact =
        sweptProjectileIntersectsTerrainV1(
          input
        );


      const parameter =
        sweptProjectileTerrainEarliestContactV1(
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
  "multi-row terrain scan ignores row-major order and chooses geometric earliest row",
  () => {
    /*
     * Row-major scan sees [2,1] before [2,3].
     *
     * Projectile travels upward:
     *
     *   (2500,5000) -> (2500,0)
     *
     * radius = 100.
     *
     * Cell [2,3] is reached first:
     *
     *   (5000-4100)/5000 = 9/50
     *
     * Cell [2,1] is reached later:
     *
     *   (5000-2100)/5000 = 29/50
     */
    assert.deepEqual(
      sweptProjectileTerrainEarliestContactV1({
        trajectorySegment: {
          start_x_scaled:
            2500n,

          start_y_scaled:
            5000n,

          end_x_scaled:
            2500n,

          end_y_scaled:
            0n,
        },

        projectileRadiusScaled:
          100n,

        physicsFixedScale:
          1000,

        widthPx:
          5,

        heightPx:
          6,

        collisionMask:
          makeMask({
            widthPx:
              5,

            heightPx:
              6,

            solidCells:
              [
                [2, 1],
                [2, 3],
              ],
          }),
      }),
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          9n,

        denominator:
          50n,
      }
    );
  }
);


test(
  "multi-row forward and reverse trajectories preserve geometric earliest parameter",
  () => {
    const collisionMask =
      makeMask({
        widthPx:
          5,

        heightPx:
          6,

        solidCells:
          [
            [2, 1],
            [2, 3],
          ],
      });


    const upward =
      sweptProjectileTerrainEarliestContactV1({
        trajectorySegment: {
          start_x_scaled:
            2500n,

          start_y_scaled:
            5000n,

          end_x_scaled:
            2500n,

          end_y_scaled:
            0n,
        },

        projectileRadiusScaled:
          100n,

        physicsFixedScale:
          1000,

        widthPx:
          5,

        heightPx:
          6,

        collisionMask,
      });


    const downward =
      sweptProjectileTerrainEarliestContactV1({
        trajectorySegment: {
          start_x_scaled:
            2500n,

          start_y_scaled:
            0n,

          end_x_scaled:
            2500n,

          end_y_scaled:
            5000n,
        },

        projectileRadiusScaled:
          100n,

        physicsFixedScale:
          1000,

        widthPx:
          5,

        heightPx:
          6,

        collisionMask,
      });


    assert.deepEqual(
      upward,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          9n,

        denominator:
          50n,
      }
    );

    assert.deepEqual(
      downward,
      {
        kind:
          CONTACT_PARAMETER_KIND_V1.RATIONAL,

        numerator:
          9n,

        denominator:
          50n,
      }
    );
  }
);
