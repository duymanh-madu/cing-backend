"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  validateBitmaskV1,
  isSolidBitmaskV1,

  squaredDistanceBigInt,
  circlesIntersect,

  classifyBlastDistance,
  calculateLinearBlastDamage,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryGeometryV1"
  );


test(
  "bitmask_v1 preserves DB MSB-first row-major semantics",
  () => {
    /*
     * width = 10
     *
     * row 0:
     *   x0 solid
     *   x7 solid
     *   x8 solid
     *   x9 empty
     *
     * byte 0 = 10000001
     * byte 1 = 10000000
     */
    const mask =
      Buffer.from([
        0b10000001,
        0b10000000,
      ]);

    assert.equal(
      validateBitmaskV1({
        widthPx: 10,
        heightPx: 1,
        collisionMask: mask,
      }),
      true
    );

    assert.equal(
      isSolidBitmaskV1({
        widthPx: 10,
        heightPx: 1,
        collisionMask: mask,
        x: 0,
        y: 0,
      }),
      true
    );

    assert.equal(
      isSolidBitmaskV1({
        widthPx: 10,
        heightPx: 1,
        collisionMask: mask,
        x: 7,
        y: 0,
      }),
      true
    );

    assert.equal(
      isSolidBitmaskV1({
        widthPx: 10,
        heightPx: 1,
        collisionMask: mask,
        x: 8,
        y: 0,
      }),
      true
    );

    assert.equal(
      isSolidBitmaskV1({
        widthPx: 10,
        heightPx: 1,
        collisionMask: mask,
        x: 9,
        y: 0,
      }),
      false
    );
  }
);


test(
  "bitmask_v1 rejects non-zero low padding bits",
  () => {
    const invalid =
      Buffer.from([
        0,
        0b00100000,
      ]);

    assert.equal(
      validateBitmaskV1({
        widthPx: 10,
        heightPx: 1,
        collisionMask: invalid,
      }),
      false
    );
  }
);


test(
  "outside map is not solid",
  () => {
    const mask =
      Buffer.from([
        0xff,
      ]);

    for (
      const [x, y] of [
        [-1, 0],
        [0, -1],
        [8, 0],
        [0, 1],
      ]
    ) {
      assert.equal(
        isSolidBitmaskV1({
          widthPx: 8,
          heightPx: 1,
          collisionMask: mask,
          x,
          y,
        }),
        false
      );
    }
  }
);


test(
  "squared distance is exact and symmetric",
  () => {
    assert.equal(
      squaredDistanceBigInt({
        ax: 0n,
        ay: 0n,
        bx: 3n,
        by: 4n,
      }),
      25n
    );

    assert.equal(
      squaredDistanceBigInt({
        ax: 3n,
        ay: 4n,
        bx: 0n,
        by: 0n,
      }),
      25n
    );
  }
);


test(
  "circle collision includes exact tangent contact",
  () => {
    assert.equal(
      circlesIntersect({
        ax: 0n,
        ay: 0n,
        radiusA: 2n,
        bx: 5n,
        by: 0n,
        radiusB: 3n,
      }),
      true
    );

    assert.equal(
      circlesIntersect({
        ax: 0n,
        ay: 0n,
        radiusA: 2n,
        bx: 6n,
        by: 0n,
        radiusB: 3n,
      }),
      false
    );
  }
);


test(
  "blast classification includes exact radius boundary",
  () => {
    assert.equal(
      classifyBlastDistance({
        impactX: 0n,
        impactY: 0n,
        targetX: 3n,
        targetY: 4n,
        blastRadius: 5n,
      }).inside,
      true
    );

    assert.equal(
      classifyBlastDistance({
        impactX: 0n,
        impactY: 0n,
        targetX: 6n,
        targetY: 0n,
        blastRadius: 5n,
      }).inside,
      false
    );
  }
);


test(
  "blast damage is full at center",
  () => {
    assert.equal(
      calculateLinearBlastDamage({
        baseDamage: 300n,
        distance: 0n,
        blastRadius: 100n,
        minimumDamageRatioScaled: 100n,
        scale: 1000n,
      }),
      300n
    );
  }
);


test(
  "blast damage follows deterministic linear floor falloff",
  () => {
    assert.equal(
      calculateLinearBlastDamage({
        baseDamage: 300n,
        distance: 25n,
        blastRadius: 100n,
        minimumDamageRatioScaled: 100n,
        scale: 1000n,
      }),
      225n
    );

    assert.equal(
      calculateLinearBlastDamage({
        baseDamage: 301n,
        distance: 50n,
        blastRadius: 100n,
        minimumDamageRatioScaled: 100n,
        scale: 1000n,
      }),
      150n
    );
  }
);


test(
  "blast minimum ratio applies at exact blast edge",
  () => {
    assert.equal(
      calculateLinearBlastDamage({
        baseDamage: 300n,
        distance: 100n,
        blastRadius: 100n,
        minimumDamageRatioScaled: 100n,
        scale: 1000n,
      }),
      30n
    );
  }
);


test(
  "blast damage is zero outside radius",
  () => {
    assert.equal(
      calculateLinearBlastDamage({
        baseDamage: 300n,
        distance: 101n,
        blastRadius: 100n,
        minimumDamageRatioScaled: 100n,
        scale: 1000n,
      }),
      0n
    );
  }
);


test(
  "canonical blast distance feeds deterministic damage falloff",
  () => {
    const {
      calculateBlastDistanceFloor,
    } =
      require(
        "../../services/games/cingArtillery/domain/cingArtilleryGeometryV1"
      );

    const distance =
      calculateBlastDistanceFloor({
        impactX: 0n,
        impactY: 0n,
        targetX: 30n,
        targetY: 40n,
      });

    assert.equal(
      distance,
      50n
    );

    assert.equal(
      calculateLinearBlastDamage({
        baseDamage: 300n,
        distance,
        blastRadius: 100n,
        minimumDamageRatioScaled: 100n,
        scale: 1000n,
      }),
      150n
    );
  }
);


test(
  "validated bitmask view preserves canonical MSB-first lookup",
  () => {
    const {
      createValidatedBitmaskViewV1,
    } =
      require(
        "../../services/games/cingArtillery/domain/cingArtilleryGeometryV1"
      );

    const mask =
      Buffer.from([
        0b10000001,
        0b10000000,
      ]);

    const view =
      createValidatedBitmaskViewV1({
        widthPx:
          10,

        heightPx:
          1,

        collisionMask:
          mask,
      });

    assert.ok(view);

    assert.equal(
      view.width_px,
      10
    );

    assert.equal(
      view.height_px,
      1
    );

    assert.equal(
      view.bytes_per_row,
      2
    );

    assert.equal(
      view.isSolid({
        x: 0,
        y: 0,
      }),
      true
    );

    assert.equal(
      view.isSolid({
        x: 7,
        y: 0,
      }),
      true
    );

    assert.equal(
      view.isSolid({
        x: 8,
        y: 0,
      }),
      true
    );

    assert.equal(
      view.isSolid({
        x: 9,
        y: 0,
      }),
      false
    );
  }
);


test(
  "validated bitmask view returns null for invalid canonical mask",
  () => {
    const {
      createValidatedBitmaskViewV1,
    } =
      require(
        "../../services/games/cingArtillery/domain/cingArtilleryGeometryV1"
      );

    const invalid =
      Buffer.from([
        0,
        0b00100000,
      ]);

    assert.equal(
      createValidatedBitmaskViewV1({
        widthPx:
          10,

        heightPx:
          1,

        collisionMask:
          invalid,
      }),
      null
    );
  }
);


test(
  "validated bitmask view treats outside coordinates as non-solid",
  () => {
    const {
      createValidatedBitmaskViewV1,
    } =
      require(
        "../../services/games/cingArtillery/domain/cingArtilleryGeometryV1"
      );

    const view =
      createValidatedBitmaskViewV1({
        widthPx:
          8,

        heightPx:
          1,

        collisionMask:
          Buffer.from([
            0xff,
          ]),
      });

    assert.ok(view);

    for (
      const [x, y]
      of [
        [-1, 0],
        [0, -1],
        [8, 0],
        [0, 1],
      ]
    ) {
      assert.equal(
        view.isSolid({
          x,
          y,
        }),
        false
      );
    }
  }
);


test(
  "validated bitmask view is immutable at authority surface",
  () => {
    const {
      createValidatedBitmaskViewV1,
    } =
      require(
        "../../services/games/cingArtillery/domain/cingArtilleryGeometryV1"
      );

    const view =
      createValidatedBitmaskViewV1({
        widthPx:
          8,

        heightPx:
          1,

        collisionMask:
          Buffer.from([
            0x80,
          ]),
      });

    assert.equal(
      Object.isFrozen(view),
      true
    );

    assert.equal(
      typeof view.isSolid,
      "function"
    );
  }
);
