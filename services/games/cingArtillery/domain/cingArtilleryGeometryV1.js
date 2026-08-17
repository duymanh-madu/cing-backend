"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * DETERMINISTIC GEOMETRY FOUNDATION V1
 *
 * Canonical map semantics:
 *
 *   integer pixel coordinates
 *   origin top-left
 *   +X right
 *   +Y down
 *
 * bitmask_v1:
 *
 *   row-major
 *   1 bit / pixel
 *   MSB-first in each byte
 *   each scanline byte-aligned
 *   1 = solid terrain
 *   0 = empty
 *
 * Pure deterministic geometry only.
 *
 * No:
 *   trajectory
 *   trig
 *   database
 *   network
 *   random
 *   wall clock
 *   gameplay state mutation
 */

const {
  floorDivBigInt,
  mulDivFloorBigInt,
  clampBigInt,
} =
  require(
    "./cingArtilleryFixedPoint"
  );

function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_GEOMETRY",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}

function assertPositiveSafeInteger(
  value,
  field
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw buildError({
      message:
        `Geometry Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}

function assertIntegerCoordinate(
  value,
  field
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value)
  ) {
    throw buildError({
      message:
        `Geometry Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}

function assertBuffer(
  value,
  field
) {
  if (!Buffer.isBuffer(value)) {
    throw buildError({
      message:
        `Geometry Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}

function assertBigInt(
  value,
  field
) {
  if (typeof value !== "bigint") {
    throw buildError({
      message:
        `Geometry Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}

function expectedBitmaskBytes({
  widthPx,
  heightPx,
}) {
  const width =
    assertPositiveSafeInteger(
      widthPx,
      "width_px"
    );

  const height =
    assertPositiveSafeInteger(
      heightPx,
      "height_px"
    );

  const bytesPerRow =
    Math.floor(
      (width + 7) / 8
    );

  return {
    bytesPerRow,
    totalBytes:
      bytesPerRow *
      height,
  };
}

function validateBitmaskV1({
  widthPx,
  heightPx,
  collisionMask,
}) {
  const mask =
    assertBuffer(
      collisionMask,
      "collision_mask"
    );

  const {
    bytesPerRow,
    totalBytes,
  } =
    expectedBitmaskBytes({
      widthPx,
      heightPx,
    });

  if (
    mask.length !==
    totalBytes
  ) {
    return false;
  }

  const unusedBits =
    bytesPerRow * 8 -
    widthPx;

  if (unusedBits === 0) {
    return true;
  }

  const paddingMask =
    (1 << unusedBits) - 1;

  for (
    let row = 0;
    row < heightPx;
    row += 1
  ) {
    const lastByteOffset =
      (row + 1) *
        bytesPerRow -
      1;

    if (
      (
        mask[lastByteOffset] &
        paddingMask
      ) !== 0
    ) {
      return false;
    }
  }

  return true;
}

function isSolidBitmaskV1({
  widthPx,
  heightPx,
  collisionMask,
  x,
  y,
}) {
  const px =
    assertIntegerCoordinate(
      x,
      "x"
    );

  const py =
    assertIntegerCoordinate(
      y,
      "y"
    );

  if (
    !validateBitmaskV1({
      widthPx,
      heightPx,
      collisionMask,
    })
  ) {
    return false;
  }

  if (
    px < 0 ||
    py < 0 ||
    px >= widthPx ||
    py >= heightPx
  ) {
    return false;
  }

  const {
    bytesPerRow,
  } =
    expectedBitmaskBytes({
      widthPx,
      heightPx,
    });

  const byteOffset =
    py *
      bytesPerRow +
    Math.floor(
      px / 8
    );

  const bitIndex =
    7 -
    (px % 8);

  return (
    collisionMask[byteOffset] &
    (1 << bitIndex)
  ) !== 0;
}

function squaredDistanceBigInt({
  ax,
  ay,
  bx,
  by,
}) {
  const x1 =
    assertBigInt(
      ax,
      "ax"
    );

  const y1 =
    assertBigInt(
      ay,
      "ay"
    );

  const x2 =
    assertBigInt(
      bx,
      "bx"
    );

  const y2 =
    assertBigInt(
      by,
      "by"
    );

  const dx =
    x1 - x2;

  const dy =
    y1 - y2;

  return (
    dx * dx +
    dy * dy
  );
}

function circlesIntersect({
  ax,
  ay,
  radiusA,
  bx,
  by,
  radiusB,
}) {
  const ra =
    assertBigInt(
      radiusA,
      "radius_a"
    );

  const rb =
    assertBigInt(
      radiusB,
      "radius_b"
    );

  if (
    ra < 0n ||
    rb < 0n
  ) {
    throw buildError({
      message:
        "Geometry Cing Artillery có radius âm",
    });
  }

  const combined =
    ra + rb;

  return (
    squaredDistanceBigInt({
      ax,
      ay,
      bx,
      by,
    }) <=
    combined *
      combined
  );
}

function classifyBlastDistance({
  impactX,
  impactY,
  targetX,
  targetY,
  blastRadius,
}) {
  const radius =
    assertBigInt(
      blastRadius,
      "blast_radius"
    );

  if (radius <= 0n) {
    throw buildError({
      message:
        "Geometry Cing Artillery có blast radius không hợp lệ",
    });
  }

  const distanceSquared =
    squaredDistanceBigInt({
      ax:
        impactX,
      ay:
        impactY,
      bx:
        targetX,
      by:
        targetY,
    });

  const radiusSquared =
    radius *
    radius;

  return Object.freeze({
    inside:
      distanceSquared <=
      radiusSquared,

    distance_squared:
      distanceSquared,

    radius_squared:
      radiusSquared,
  });
}

/*
 * Deterministic linear blast falloff using squared-distance
 * comparison for classification and integer distance input
 * supplied by the future canonical distance primitive.
 *
 * This function does NOT calculate sqrt.
 *
 * Caller supplies canonical integer distance on the same
 * fixed-point scale as blastRadius.
 */
function calculateLinearBlastDamage({
  baseDamage,
  distance,
  blastRadius,
  minimumDamageRatioScaled,
  scale,
}) {
  const base =
    assertBigInt(
      baseDamage,
      "base_damage"
    );

  const d =
    assertBigInt(
      distance,
      "distance"
    );

  const radius =
    assertBigInt(
      blastRadius,
      "blast_radius"
    );

  const minRatio =
    assertBigInt(
      minimumDamageRatioScaled,
      "minimum_damage_ratio"
    );

  const fixedScale =
    assertBigInt(
      scale,
      "scale"
    );

  if (
    base <= 0n ||
    radius <= 0n ||
    fixedScale <= 0n ||
    minRatio <= 0n ||
    minRatio > fixedScale
  ) {
    throw buildError({
      message:
        "Geometry Cing Artillery có damage falloff input không hợp lệ",
    });
  }

  if (d < 0n) {
    throw buildError({
      message:
        "Geometry Cing Artillery có blast distance âm",
    });
  }

  if (d > radius) {
    return 0n;
  }

  /*
   * ratio =
   *
   *   1 - distance/radius
   *
   * then clamp to canonical minimum blast ratio.
   *
   * All operations use mathematical floor semantics.
   */
  const lostRatio =
    mulDivFloorBigInt(
      d,
      fixedScale,
      radius
    );

  const rawRatio =
    fixedScale -
    lostRatio;

  const effectiveRatio =
    clampBigInt(
      rawRatio,
      minRatio,
      fixedScale
    );

  return mulDivFloorBigInt(
    base,
    effectiveRatio,
    fixedScale
  );
}

module.exports = {
  validateBitmaskV1,
  isSolidBitmaskV1,

  squaredDistanceBigInt,
  circlesIntersect,

  classifyBlastDistance,
  calculateLinearBlastDamage,
};
