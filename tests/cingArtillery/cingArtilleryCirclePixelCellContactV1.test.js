"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  circleIntersectsPixelCellV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryCirclePixelCellContactV1"
  );


function contact(
  overrides = {}
) {
  return circleIntersectsPixelCellV1({
    centerXScaled:
      1500n,

    centerYScaled:
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
  "circle center inside pixel cell contacts",
  () => {
    assert.equal(
      contact(),
      true
    );
  }
);


test(
  "exact tangent to left pixel edge counts as contact",
  () => {
    assert.equal(
      contact({
        centerXScaled:
          750n,

        centerYScaled:
          1500n,

        radiusScaled:
          250n,
      }),
      true
    );
  }
);


test(
  "one scaled unit beyond left edge tangent is not contact",
  () => {
    assert.equal(
      contact({
        centerXScaled:
          749n,

        centerYScaled:
          1500n,

        radiusScaled:
          250n,
      }),
      false
    );
  }
);


test(
  "exact tangent to right pixel edge counts as contact",
  () => {
    assert.equal(
      contact({
        centerXScaled:
          2250n,

        centerYScaled:
          1500n,

        radiusScaled:
          250n,
      }),
      true
    );
  }
);


test(
  "exact tangent to bottom pixel edge counts as contact",
  () => {
    assert.equal(
      contact({
        centerXScaled:
          1500n,

        centerYScaled:
          2250n,

        radiusScaled:
          250n,
      }),
      true
    );
  }
);


test(
  "exact corner tangent counts as contact",
  () => {
    /*
     * cell corner = (2000, 2000)
     *
     * center = (2300, 2400)
     *
     * distance =
     *   sqrt(300² + 400²)
     *   = 500
     */
    assert.equal(
      contact({
        centerXScaled:
          2300n,

        centerYScaled:
          2400n,

        radiusScaled:
          500n,
      }),
      true
    );
  }
);


test(
  "one scaled unit beyond exact corner tangent is not contact",
  () => {
    /*
     * dx = 301
     * dy = 400
     *
     * distance² =
     *   301² + 400²
     *   > 500²
     */
    assert.equal(
      contact({
        centerXScaled:
          2301n,

        centerYScaled:
          2400n,

        radiusScaled:
          500n,
      }),
      false
    );
  }
);


test(
  "circle touching a shared integer cell boundary contacts both adjacent closed cells",
  () => {
    const leftCell =
      circleIntersectsPixelCellV1({
        centerXScaled:
          2000n,

        centerYScaled:
          1500n,

        radiusScaled:
          1n,

        cellX:
          1n,

        cellY:
          1n,

        physicsFixedScale:
          1000,
      });

    const rightCell =
      circleIntersectsPixelCellV1({
        centerXScaled:
          2000n,

        centerYScaled:
          1500n,

        radiusScaled:
          1n,

        cellX:
          2n,

        cellY:
          1n,

        physicsFixedScale:
          1000,
      });

    assert.equal(
      leftCell,
      true
    );

    assert.equal(
      rightCell,
      true
    );
  }
);


test(
  "negative pixel cells remain valid pure geometry",
  () => {
    assert.equal(
      circleIntersectsPixelCellV1({
        centerXScaled:
          -500n,

        centerYScaled:
          -500n,

        radiusScaled:
          100n,

        cellX:
          -1n,

        cellY:
          -1n,

        physicsFixedScale:
          1000,
      }),
      true
    );
  }
);


test(
  "subpixel radius remains exact on the fixed lattice",
  () => {
    assert.equal(
      circleIntersectsPixelCellV1({
        centerXScaled:
          950n,

        centerYScaled:
          1500n,

        radiusScaled:
          50n,

        cellX:
          1n,

        cellY:
          1n,

        physicsFixedScale:
          1000,
      }),
      true
    );

    assert.equal(
      circleIntersectsPixelCellV1({
        centerXScaled:
          949n,

        centerYScaled:
          1500n,

        radiusScaled:
          50n,

        cellX:
          1n,

        cellY:
          1n,

        physicsFixedScale:
          1000,
      }),
      false
    );
  }
);


test(
  "arbitrarily large BigInt world coordinates remain exact",
  () => {
    const base =
      10n ** 80n;

    assert.equal(
      circleIntersectsPixelCellV1({
        centerXScaled:
          base * 1000n +
          500n,

        centerYScaled:
          -base * 1000n +
          500n,

        radiusScaled:
          1n,

        cellX:
          base,

        cellY:
          -base,

        physicsFixedScale:
          1000,
      }),
      true
    );
  }
);


test(
  "circle coordinates and cell coordinates must be BigInt",
  () => {
    const invalid = [
      1,
      "1",
      null,
      undefined,
    ];

    for (
      const centerXScaled
      of invalid
    ) {
      assert.throws(
        () =>
          contact({
            centerXScaled,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_CIRCLE_PIXEL_CELL_CONTACT_V1",
        }
      );
    }

    for (
      const centerYScaled
      of invalid
    ) {
      assert.throws(
        () =>
          contact({
            centerYScaled,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_CIRCLE_PIXEL_CELL_CONTACT_V1",
        }
      );
    }

    for (
      const cellX
      of invalid
    ) {
      assert.throws(
        () =>
          contact({
            cellX,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_CIRCLE_PIXEL_CELL_CONTACT_V1",
        }
      );
    }

    for (
      const cellY
      of invalid
    ) {
      assert.throws(
        () =>
          contact({
            cellY,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_CIRCLE_PIXEL_CELL_CONTACT_V1",
        }
      );
    }
  }
);


test(
  "radius must be positive canonical BigInt",
  () => {
    for (
      const radiusScaled
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
          contact({
            radiusScaled,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_CIRCLE_PIXEL_CELL_CONTACT_V1",
        }
      );
    }
  }
);


test(
  "physics fixed scale must be a positive safe integer",
  () => {
    for (
      const physicsFixedScale
      of [
        0,
        -1,
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
        "1000",
        1000n,
        null,
      ]
    ) {
      assert.throws(
        () =>
          contact({
            physicsFixedScale,
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_CIRCLE_PIXEL_CELL_CONTACT_V1",
        }
      );
    }
  }
);
