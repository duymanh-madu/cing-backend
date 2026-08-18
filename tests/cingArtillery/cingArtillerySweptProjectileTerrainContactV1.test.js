"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  sweptProjectileIntersectsTerrainV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySweptProjectileTerrainContactV1"
  );


function makeMask({
  widthPx,
  heightPx,
  solidCells,
}) {
  const bytesPerRow =
    Math.floor(
      (widthPx + 7) / 8
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
        x / 8
      );

    const bitIndex =
      7 -
      (x % 8);

    mask[byteOffset] |=
      1 << bitIndex;
  }

  return mask;
}


function segment(
  overrides = {}
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
  overrides = {}
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
        [[2, 1]],
    });

  return sweptProjectileIntersectsTerrainV1({
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
  "segment crossing solid terrain between endpoint samples contacts",
  () => {
    assert.equal(
      query(),
      true
    );
  }
);


test(
  "same swept path through empty terrain does not contact",
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
      false
    );
  }
);


test(
  "solid broad-phase candidate outside exact rounded narrow phase is rejected",
  () => {
    const mask =
      makeMask({
        widthPx:
          5,

        heightPx:
          5,

        solidCells:
          [[1, 1]],
      });

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
          mask,
      }),
      false
    );
  }
);


test(
  "exact swept tangent to solid terrain counts as contact",
  () => {
    const mask =
      makeMask({
        widthPx:
          5,

        heightPx:
          4,

        solidCells:
          [[2, 1]],
      });

    assert.equal(
      query({
        trajectorySegment:
          segment({
            start_x_scaled:
              0n,

            start_y_scaled:
              750n,

            end_x_scaled:
              5000n,

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
          mask,
      }),
      true
    );
  }
);


test(
  "one lattice unit beyond swept tangent does not contact terrain",
  () => {
    const mask =
      makeMask({
        widthPx:
          5,

        heightPx:
          4,

        solidCells:
          [[2, 1]],
      });

    assert.equal(
      query({
        trajectorySegment:
          segment({
            start_x_scaled:
              0n,

            start_y_scaled:
              749n,

            end_x_scaled:
              5000n,

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
          mask,
      }),
      false
    );
  }
);


test(
  "projectile segment outside left map can still sweep into edge terrain",
  () => {
    const mask =
      makeMask({
        widthPx:
          2,

        heightPx:
          2,

        solidCells:
          [[0, 0]],
      });

    assert.equal(
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
          mask,
      }),
      true
    );
  }
);


test(
  "candidate rectangle fully outside map returns false",
  () => {
    const mask =
      makeMask({
        widthPx:
          2,

        heightPx:
          2,

        solidCells:
          [[0, 0]],
      });

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
          mask,
      }),
      false
    );
  }
);


test(
  "reverse segment preserves terrain contact result",
  () => {
    const mask =
      makeMask({
        widthPx:
          6,

        heightPx:
          4,

        solidCells:
          [[2, 1]],
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
  "non-byte-aligned width preserves canonical bitmask scanning",
  () => {
    const mask =
      makeMask({
        widthPx:
          10,

        heightPx:
          2,

        solidCells:
          [[8, 1]],
      });

    assert.equal(
      sweptProjectileIntersectsTerrainV1({
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
          mask,
      }),
      true
    );
  }
);


test(
  "invalid bitmask fails closed as invalid terrain authority",
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
          "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_TERRAIN_BITMASK_V1",
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
          "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_TERRAIN_CONTACT_V1",
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
          query(item),
        {
          code:
            "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_TERRAIN_CONTACT_V1",
        }
      );
    }
  }
);


test(
  "diagonal swept motion reaches a solid cell missed by endpoint-only collision",
  () => {
    const mask =
      makeMask({
        widthPx:
          6,

        heightPx:
          6,

        solidCells:
          [[2, 2]],
      });

    assert.equal(
      sweptProjectileIntersectsTerrainV1({
        trajectorySegment: {
          start_x_scaled:
            0n,

          start_y_scaled:
            0n,

          end_x_scaled:
            5000n,

          end_y_scaled:
            5000n,
        },

        projectileRadiusScaled:
          10n,

        physicsFixedScale:
          1000,

        widthPx:
          6,

        heightPx:
          6,

        collisionMask:
          mask,
      }),
      true
    );
  }
);


test(
  "diagonal corner tangent remains inside swept broad phase",
  () => {
    /*
     * Solid cell [2,2] has top-left corner at
     * (2000,2000).
     *
     * Segment:
     *   (0,1750) -> (4000,1750)
     *
     * radius=250
     *
     * is exactly tangent to the top-left rounded corner
     * at (2000,1750).
     */
    const mask =
      makeMask({
        widthPx:
          5,

        heightPx:
          5,

        solidCells:
          [[2, 2]],
      });

    assert.equal(
      sweptProjectileIntersectsTerrainV1({
        trajectorySegment: {
          start_x_scaled:
            0n,

          start_y_scaled:
            1750n,

          end_x_scaled:
            4000n,

          end_y_scaled:
            1750n,
        },

        projectileRadiusScaled:
          250n,

        physicsFixedScale:
          1000,

        widthPx:
          5,

        heightPx:
          5,

        collisionMask:
          mask,
      }),
      true
    );
  }
);


test(
  "one lattice unit beyond diagonal corner tangent remains a miss",
  () => {
    const mask =
      makeMask({
        widthPx:
          5,

        heightPx:
          5,

        solidCells:
          [[2, 2]],
      });

    assert.equal(
      sweptProjectileIntersectsTerrainV1({
        trajectorySegment: {
          start_x_scaled:
            0n,

          start_y_scaled:
            1749n,

          end_x_scaled:
            4000n,

          end_y_scaled:
            1749n,
        },

        projectileRadiusScaled:
          250n,

        physicsFixedScale:
          1000,

        widthPx:
          5,

        heightPx:
          5,

        collisionMask:
          mask,
      }),
      false
    );
  }
);


test(
  "exact lower swept boundary includes previous closed terrain cell",
  () => {
    /*
     * Projectile center minimum X = 1250,
     * radius = 250.
     *
     * Swept circle reaches exactly x=1000.
     * Closed cell 0 occupies [0,1000], therefore cell 0
     * must remain a candidate and tangent contact counts.
     */
    const mask =
      makeMask({
        widthPx:
          4,

        heightPx:
          3,

        solidCells:
          [[0, 1]],
      });

    assert.equal(
      sweptProjectileIntersectsTerrainV1({
        trajectorySegment: {
          start_x_scaled:
            1250n,

          start_y_scaled:
            1500n,

          end_x_scaled:
            3000n,

          end_y_scaled:
            1500n,
        },

        projectileRadiusScaled:
          250n,

        physicsFixedScale:
          1000,

        widthPx:
          4,

        heightPx:
          3,

        collisionMask:
          mask,
      }),
      true
    );
  }
);


test(
  "one lattice unit above lower swept boundary excludes previous terrain cell",
  () => {
    const mask =
      makeMask({
        widthPx:
          4,

        heightPx:
          3,

        solidCells:
          [[0, 1]],
      });

    assert.equal(
      sweptProjectileIntersectsTerrainV1({
        trajectorySegment: {
          start_x_scaled:
            1251n,

          start_y_scaled:
            1500n,

          end_x_scaled:
            3000n,

          end_y_scaled:
            1500n,
        },

        projectileRadiusScaled:
          250n,

        physicsFixedScale:
          1000,

        widthPx:
          4,

        heightPx:
          3,

        collisionMask:
          mask,
      }),
      false
    );
  }
);


test(
  "reversed extrema preserve diagonal swept terrain result",
  () => {
    const mask =
      makeMask({
        widthPx:
          7,

        heightPx:
          7,

        solidCells:
          [[3, 3]],
      });

    const forward =
      sweptProjectileIntersectsTerrainV1({
        trajectorySegment: {
          start_x_scaled:
            500n,

          start_y_scaled:
            1000n,

          end_x_scaled:
            6000n,

          end_y_scaled:
            5500n,
        },

        projectileRadiusScaled:
          125n,

        physicsFixedScale:
          1000,

        widthPx:
          7,

        heightPx:
          7,

        collisionMask:
          mask,
      });

    const reverse =
      sweptProjectileIntersectsTerrainV1({
        trajectorySegment: {
          start_x_scaled:
            6000n,

          start_y_scaled:
            5500n,

          end_x_scaled:
            500n,

          end_y_scaled:
            1000n,
        },

        projectileRadiusScaled:
          125n,

        physicsFixedScale:
          1000,

        widthPx:
          7,

        heightPx:
          7,

        collisionMask:
          mask,
      });

    assert.equal(
      reverse,
      forward
    );
  }
);
