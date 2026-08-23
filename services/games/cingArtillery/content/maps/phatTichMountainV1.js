"use strict";

const crypto =
  require("node:crypto");


const MAP_KEY =
  "phat-tich-mountain";

const MAP_VERSION =
  1;

const DISPLAY_NAME =
  "Núi Phật Tích";

const WIDTH_PX =
  960;

const HEIGHT_PX =
  540;

const COLLISION_FORMAT =
  "bitmask_v1";

const RENDER_ASSET_KEY =
  "/game-assets/cing-piu-piu/maps/phat-tich-mountain/v1/map.svg";

const SELECTION_WEIGHT =
  1;


/*
 * =========================================================
 * NÚI PHẬT TÍCH V1 — COMBAT DNA
 * =========================================================
 *
 * Identity:
 *
 *   vertical artillery
 *   stepped mountain terraces
 *   central high ridge
 *   low-angle obstruction
 *   asymmetric openings
 *   multiple spawn elevations
 *
 * Coordinates:
 *
 *   x: left -> right
 *   y: top  -> bottom
 *
 * surfaceY(x):
 *
 *   first solid terrain pixel for column x.
 *
 * Therefore:
 *
 *   y < surfaceY(x)  => empty
 *   y >= surfaceY(x) => solid
 *
 * Geometry is integer-only.
 *
 * No random.
 * No trigonometry.
 * No floating-point noise.
 * No runtime entropy.
 */


function assertX(
  x
) {
  if (
    !Number.isInteger(x) ||
    x < 0 ||
    x >= WIDTH_PX
  ) {
    throw new RangeError(
      "phat-tich-mountain x out of bounds"
    );
  }
}


function lerpFloor({
  x,
  x0,
  y0,
  x1,
  y1,
}) {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(x0) ||
    !Number.isInteger(y0) ||
    !Number.isInteger(x1) ||
    !Number.isInteger(y1) ||
    x1 <= x0 ||
    x < x0 ||
    x > x1
  ) {
    throw new RangeError(
      "phat-tich-mountain invalid integer interpolation"
    );
  }

  return (
    y0 +
    Math.floor(
      (
        (x - x0) *
        (y1 - y0)
      ) /
      (x1 - x0)
    )
  );
}


/*
 * Terrain profile.
 *
 * Intentionally NOT mirrored.
 *
 * Left:
 *   climbing shoulder
 *   elevated player terrace
 *   descending inner wall
 *
 * Center:
 *   deep approach
 *   sudden high ridge
 *   uneven opposite descent
 *
 * Right:
 *   staggered terraces
 *   narrow shelf
 *   descending outer shoulder
 *
 * Lower y = higher ground.
 */
function surfaceY(
  x
) {
  assertX(x);

  if (x <= 70) {
    return lerpFloor({
      x,
      x0: 0,
      y0: 386,
      x1: 70,
      y1: 354,
    });
  }

  if (x <= 145) {
    return lerpFloor({
      x,
      x0: 70,
      y0: 354,
      x1: 145,
      y1: 304,
    });
  }

  if (x <= 220) {
    return 304;
  }

  if (x <= 285) {
    return lerpFloor({
      x,
      x0: 220,
      y0: 304,
      x1: 285,
      y1: 348,
    });
  }

  if (x <= 350) {
    return lerpFloor({
      x,
      x0: 285,
      y0: 348,
      x1: 350,
      y1: 389,
    });
  }

  if (x <= 405) {
    return lerpFloor({
      x,
      x0: 350,
      y0: 389,
      x1: 405,
      y1: 332,
    });
  }

  if (x <= 455) {
    return lerpFloor({
      x,
      x0: 405,
      y0: 332,
      x1: 455,
      y1: 276,
    });
  }

  if (x <= 495) {
    return lerpFloor({
      x,
      x0: 455,
      y0: 276,
      x1: 495,
      y1: 286,
    });
  }

  if (x <= 555) {
    return lerpFloor({
      x,
      x0: 495,
      y0: 286,
      x1: 555,
      y1: 344,
    });
  }

  if (x <= 615) {
    return lerpFloor({
      x,
      x0: 555,
      y0: 344,
      x1: 615,
      y1: 391,
    });
  }

  if (x <= 670) {
    return lerpFloor({
      x,
      x0: 615,
      y0: 391,
      x1: 670,
      y1: 346,
    });
  }

  if (x <= 730) {
    return 346;
  }

  if (x <= 785) {
    return lerpFloor({
      x,
      x0: 730,
      y0: 346,
      x1: 785,
      y1: 316,
    });
  }

  if (x <= 845) {
    return 316;
  }

  if (x <= 905) {
    return lerpFloor({
      x,
      x0: 845,
      y0: 316,
      x1: 905,
      y1: 358,
    });
  }

  return lerpFloor({
    x,
    x0: 905,
    y0: 358,
    x1: 959,
    y1: 392,
  });
}


function bytesPerRow() {
  return Math.ceil(
    WIDTH_PX / 8
  );
}


function setSolidBit({
  collisionMask,
  x,
  y,
}) {
  const rowBytes =
    bytesPerRow();

  const byteIndex =
    (
      y *
      rowBytes
    ) +
    Math.floor(
      x / 8
    );

  const bitOffset =
    x % 8;

  collisionMask[
    byteIndex
  ] |=
    1 <<
    (
      7 -
      bitOffset
    );
}


function isSolid({
  collisionMask,
  x,
  y,
}) {
  if (
    !Buffer.isBuffer(
      collisionMask
    )
  ) {
    throw new TypeError(
      "collisionMask must be Buffer"
    );
  }

  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= WIDTH_PX ||
    y >= HEIGHT_PX
  ) {
    return false;
  }

  const rowBytes =
    bytesPerRow();

  const byteIndex =
    (
      y *
      rowBytes
    ) +
    Math.floor(
      x / 8
    );

  const bitOffset =
    x % 8;

  return (
    collisionMask[
      byteIndex
    ] &
    (
      1 <<
      (
        7 -
        bitOffset
      )
    )
  ) !== 0;
}


function buildCollisionMask() {
  const collisionMask =
    Buffer.alloc(
      bytesPerRow() *
      HEIGHT_PX,
      0
    );

  for (
    let x = 0;
    x < WIDTH_PX;
    x += 1
  ) {
    const surface =
      surfaceY(x);

    for (
      let y = surface;
      y < HEIGHT_PX;
      y += 1
    ) {
      setSolidBit({
        collisionMask,
        x,
        y,
      });
    }
  }

  return collisionMask;
}


/*
 * Spawn variants are authored content, not runtime randomness.
 *
 * PostgreSQL remains authoritative for choosing a published
 * enabled spawn pair when a combat world is created.
 */
const SPAWN_X_PAIRS =
  Object.freeze([
    Object.freeze({
      spawn_key:
        "upper_terraces",
      side_a_x:
        178,
      side_b_x:
        816,
      enabled:
        true,
      selection_weight:
        1,
    }),

    Object.freeze({
      spawn_key:
        "outer_to_inner",
      side_a_x:
        96,
      side_b_x:
        754,
      enabled:
        true,
      selection_weight:
        1,
    }),

    Object.freeze({
      spawn_key:
        "inner_to_outer",
      side_a_x:
        248,
      side_b_x:
        882,
      enabled:
        true,
      selection_weight:
        1,
    }),
  ]);


function buildSpawnPairs() {
  return SPAWN_X_PAIRS.map(
    (
      spawn
    ) => ({
      ...spawn,

      side_a_y:
        surfaceY(
          spawn.side_a_x
        ),

      side_b_y:
        surfaceY(
          spawn.side_b_x
        ),
    })
  );
}


function sha256(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      value
    )
    .digest(
      "hex"
    );
}


function buildMapContentV1() {
  const collisionMask =
    buildCollisionMask();

  const spawnPairs =
    buildSpawnPairs();

  return Object.freeze({
    mapKey:
      MAP_KEY,

    version:
      MAP_VERSION,

    displayName:
      DISPLAY_NAME,

    widthPx:
      WIDTH_PX,

    heightPx:
      HEIGHT_PX,

    collisionFormat:
      COLLISION_FORMAT,

    collisionMask,

    collisionMaskSha256:
      sha256(
        collisionMask
      ),

    renderAssetKey:
      RENDER_ASSET_KEY,

    selectionWeight:
      SELECTION_WEIGHT,

    spawnPairs:
      Object.freeze(
        spawnPairs.map(
          (
            spawn
          ) =>
            Object.freeze(
              spawn
            )
        )
      ),
  });
}


module.exports = {
  MAP_KEY,
  MAP_VERSION,
  DISPLAY_NAME,
  WIDTH_PX,
  HEIGHT_PX,
  COLLISION_FORMAT,
  RENDER_ASSET_KEY,
  SELECTION_WEIGHT,

  lerpFloor,
  surfaceY,
  bytesPerRow,
  isSolid,
  buildCollisionMask,
  buildSpawnPairs,
  buildMapContentV1,
};
