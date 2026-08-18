"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  projectileIntersectsTerrainV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryProjectileTerrainCoverageV1"
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
    ] of solidCells
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


function query(
  overrides = {}
) {
  const widthPx =
    overrides.widthPx ??
    4;

  const heightPx =
    overrides.heightPx ??
    4;

  const collisionMask =
    overrides.collisionMask ??
    makeMask({
      widthPx,
      heightPx,
      solidCells:
        [[1, 1]],
    });

  return projectileIntersectsTerrainV1({
    projectileXScaled:
      1500n,

    projectileYScaled:
      1500n,

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
  "projectile circle inside solid pixel contacts terrain",
  () => {
    assert.equal(
      query(),
      true
    );
  }
);


test(
  "projectile circle inside empty pixel does not contact terrain",
  () => {
    assert.equal(
      query({
        collisionMask:
          makeMask({
            widthPx:
              4,

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
  "solid broad-phase candidate outside narrow phase does not false-positive",
  () => {
    const mask =
      makeMask({
        widthPx:
          4,

        heightPx:
          4,

        solidCells:
          [[2, 2]],
      });

    assert.equal(
      query({
        projectileXScaled:
          1900n,

        projectileYScaled:
          1900n,

        projectileRadiusScaled:
          100n,

        collisionMask:
          mask,
      }),
      false
    );
  }
);


test(
  "exact tangent to solid cell edge counts as terrain contact",
  () => {
    assert.equal(
      query({
        projectileXScaled:
          2250n,

        projectileYScaled:
          1500n,

        projectileRadiusScaled:
          250n,
      }),
      true
    );
  }
);


test(
  "one scaled unit beyond tangent does not contact solid cell",
  () => {
    assert.equal(
      query({
        projectileXScaled:
          2251n,

        projectileYScaled:
          1500n,

        projectileRadiusScaled:
          250n,
      }),
      false
    );
  }
);


test(
  "exact corner tangent to solid cell counts as terrain contact",
  () => {
    assert.equal(
      query({
        projectileXScaled:
          2300n,

        projectileYScaled:
          2400n,

        projectileRadiusScaled:
          500n,
      }),
      true
    );
  }
);


test(
  "projectile center outside left map can still touch solid edge terrain",
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
        projectileXScaled:
          -250n,

        projectileYScaled:
          500n,

        projectileRadiusScaled:
          250n,

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
  "projectile center outside right map can still touch solid edge terrain",
  () => {
    const mask =
      makeMask({
        widthPx:
          2,

        heightPx:
          2,

        solidCells:
          [[1, 0]],
      });

    assert.equal(
      query({
        projectileXScaled:
          2250n,

        projectileYScaled:
          500n,

        projectileRadiusScaled:
          250n,

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
  "candidate range fully outside map returns false without unsafe Number projection",
  () => {
    const huge =
      10n **
      100n;

    assert.equal(
      query({
        projectileXScaled:
          huge,

        projectileYScaled:
          -huge,

        projectileRadiusScaled:
          1000n,
      }),
      false
    );
  }
);


test(
  "multiple candidate cells return contact when any solid cell passes narrow phase",
  () => {
    const mask =
      makeMask({
        widthPx:
          4,

        heightPx:
          4,

        solidCells:
          [
            [0, 0],
            [1, 1],
            [2, 1],
          ],
      });

    assert.equal(
      query({
        projectileXScaled:
          2000n,

        projectileYScaled:
          1500n,

        projectileRadiusScaled:
          200n,

        collisionMask:
          mask,
      }),
      true
    );
  }
);


test(
  "valid bitmask with non-byte-aligned width is scanned correctly",
  () => {
    const widthPx =
      10;

    const heightPx =
      1;

    const mask =
      makeMask({
        widthPx,
        heightPx,
        solidCells:
          [[8, 0]],
      });

    assert.equal(
      query({
        projectileXScaled:
          8500n,

        projectileYScaled:
          500n,

        projectileRadiusScaled:
          100n,

        widthPx,
        heightPx,

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
          widthPx:
            10,

          heightPx:
            1,

          collisionMask:
            Buffer.from([
              0,
            ]),
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_PROJECTILE_TERRAIN_BITMASK_V1",
      }
    );
  }
);


test(
  "projectile center coordinates must be canonical BigInts",
  () => {
    const invalid = [
      1,
      "1",
      null,
      undefined,
    ];

    for (
      const projectileXScaled
      of invalid
    ) {
      assert.throws(
        () =>
          query({
            projectileXScaled,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_PROJECTILE_TERRAIN_COVERAGE_V1",
        }
      );
    }

    for (
      const projectileYScaled
      of invalid
    ) {
      assert.throws(
        () =>
          query({
            projectileYScaled,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_PROJECTILE_TERRAIN_COVERAGE_V1",
        }
      );
    }
  }
);


test(
  "projectile radius must be positive canonical BigInt",
  () => {
    for (
      const projectileRadiusScaled
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
            projectileRadiusScaled,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_PROJECTILE_TERRAIN_COVERAGE_V1",
        }
      );
    }
  }
);


test(
  "map dimensions and physics scale must stay inside canonical domain",
  () => {
    for (
      const widthPx
      of [
        0,
        -1,
        1.5,
        2147483648,
      ]
    ) {
      assert.throws(
        () =>
          query({
            widthPx,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_PROJECTILE_TERRAIN_COVERAGE_V1",
        }
      );
    }

    for (
      const physicsFixedScale
      of [
        0,
        -1,
        1.5,
        2147483648,
        "1000",
        1000n,
      ]
    ) {
      assert.throws(
        () =>
          query({
            physicsFixedScale,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_PROJECTILE_TERRAIN_COVERAGE_V1",
        }
      );
    }
  }
);
