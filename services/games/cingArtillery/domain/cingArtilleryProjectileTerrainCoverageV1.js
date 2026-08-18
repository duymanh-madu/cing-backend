"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * PROJECTILE VS TERRAIN COVERAGE V1
 *
 * Owns instantaneous projectile-circle contact against
 * canonical bitmask_v1 terrain.
 *
 * Pipeline:
 *
 *   projectile center/radius
 *   → unbounded closed-contact candidate cell range
 *   → BigInt clip to map bounds
 *   → safe in-bounds BigInt → Number projection
 *   → solid-bit lookup
 *   → exact circle-vs-pixel-cell narrow phase
 *
 * IMPORTANT:
 *
 * Projectile center being outside the map does NOT
 * automatically mean there is no terrain contact.
 *
 * A circle centered outside the map may still tangent or
 * overlap a solid edge cell.
 *
 * Therefore this module clips the circle candidate range,
 * never the projectile center.
 *
 * This module owns ONLY instantaneous terrain coverage.
 *
 * It does NOT:
 *
 *   classify gameplay out_of_bounds
 *   sample trajectory
 *   build trajectory segments
 *   perform swept collision
 *   choose earliest collision
 *   perform player collision
 *   decide terrain/player precedence
 *   produce shot-resolution outcome
 *   calculate damage
 *   mutate terrain
 *   mutate gameplay
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  POSTGRES_INTEGER_MAX,
} =
  require(
    "./cingArtilleryScaledToPixelBridgeV1"
  );

const {
  deriveCircleCandidateCellRangeV1,
} =
  require(
    "./cingArtilleryCircleCandidateCellRangeV1"
  );

const {
  circleIntersectsPixelCellV1,
} =
  require(
    "./cingArtilleryCirclePixelCellContactV1"
  );

const {
  validateBitmaskV1,
  isSolidBitmaskV1,
} =
  require(
    "./cingArtilleryGeometryV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_PROJECTILE_TERRAIN_COVERAGE_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function assertBigInt(
  value,
  field
) {
  if (
    typeof value !==
    "bigint"
  ) {
    throw buildError({
      message:
        `Projectile terrain coverage Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function assertPositiveBigInt(
  value,
  field
) {
  const normalized =
    assertBigInt(
      value,
      field
    );

  if (
    normalized <= 0n
  ) {
    throw buildError({
      message:
        `Projectile terrain coverage Cing Artillery yêu cầu ${field} > 0`,
    });
  }

  return normalized;
}


function assertMapDimension(
  value,
  field
) {
  if (
    typeof value !==
      "number" ||
    !Number.isSafeInteger(
      value
    ) ||
    value <= 0 ||
    value >
      POSTGRES_INTEGER_MAX
  ) {
    throw buildError({
      message:
        `Projectile terrain coverage Cing Artillery có ${field} không hợp lệ`,
    });
  }

  return value;
}


function assertPhysicsFixedScale(
  value
) {
  if (
    typeof value !==
      "number" ||
    !Number.isSafeInteger(
      value
    ) ||
    value <= 0 ||
    value >
      POSTGRES_INTEGER_MAX
  ) {
    throw buildError({
      message:
        "Projectile terrain coverage Cing Artillery có physics_fixed_scale không hợp lệ",
    });
  }

  return value;
}


function assertCollisionMask(
  value
) {
  if (
    !Buffer.isBuffer(
      value
    )
  ) {
    throw buildError({
      message:
        "Projectile terrain coverage Cing Artillery có collision_mask không hợp lệ",
    });
  }

  return value;
}


function maxBigInt(
  a,
  b
) {
  return a > b
    ? a
    : b;
}


function minBigInt(
  a,
  b
) {
  return a < b
    ? a
    : b;
}


function projectileIntersectsTerrainV1({
  projectileXScaled,
  projectileYScaled,
  projectileRadiusScaled,

  physicsFixedScale,

  widthPx,
  heightPx,
  collisionMask,
}) {
  const centerX =
    assertBigInt(
      projectileXScaled,
      "projectile_x_scaled"
    );

  const centerY =
    assertBigInt(
      projectileYScaled,
      "projectile_y_scaled"
    );

  const radius =
    assertPositiveBigInt(
      projectileRadiusScaled,
      "projectile_radius_scaled"
    );

  const scale =
    assertPhysicsFixedScale(
      physicsFixedScale
    );

  const width =
    assertMapDimension(
      widthPx,
      "width_px"
    );

  const height =
    assertMapDimension(
      heightPx,
      "height_px"
    );

  const mask =
    assertCollisionMask(
      collisionMask
    );


  if (
    !validateBitmaskV1({
      widthPx:
        width,

      heightPx:
        height,

      collisionMask:
        mask,
    })
  ) {
    throw buildError({
      message:
        "Projectile terrain coverage Cing Artillery có bitmask_v1 không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_PROJECTILE_TERRAIN_BITMASK_V1",
    });
  }


  const candidate =
    deriveCircleCandidateCellRangeV1({
      centerXScaled:
        centerX,

      centerYScaled:
        centerY,

      radiusScaled:
        radius,

      physicsFixedScale:
        scale,
    });


  const minMapX =
    0n;

  const minMapY =
    0n;

  const maxMapX =
    BigInt(
      width - 1
    );

  const maxMapY =
    BigInt(
      height - 1
    );


  const minX =
    maxBigInt(
      candidate.min_x_cell,
      minMapX
    );

  const maxX =
    minBigInt(
      candidate.max_x_cell,
      maxMapX
    );

  const minY =
    maxBigInt(
      candidate.min_y_cell,
      minMapY
    );

  const maxY =
    minBigInt(
      candidate.max_y_cell,
      maxMapY
    );


  if (
    minX > maxX ||
    minY > maxY
  ) {
    return false;
  }


  for (
    let y =
      minY;

    y <= maxY;

    y += 1n
  ) {
    for (
      let x =
        minX;

      x <= maxX;

      x += 1n
    ) {
      /*
       * Safe conversion boundary:
       *
       * x/y were already clipped in BigInt space to:
       *
       *   0 <= x < width <= PG integer max
       *   0 <= y < height <= PG integer max
       */
      const xPx =
        Number(
          x
        );

      const yPx =
        Number(
          y
        );


      if (
        !Number.isSafeInteger(
          xPx
        ) ||
        !Number.isSafeInteger(
          yPx
        )
      ) {
        throw buildError({
          message:
            "Projectile terrain coverage Cing Artillery không thể project candidate cell an toàn",
          code:
            "CING_ARTILLERY_PROJECTILE_TERRAIN_UNSAFE_CELL_PROJECTION",
        });
      }


      if (
        !isSolidBitmaskV1({
          widthPx:
            width,

          heightPx:
            height,

          collisionMask:
            mask,

          x:
            xPx,

          y:
            yPx,
        })
      ) {
        continue;
      }


      if (
        circleIntersectsPixelCellV1({
          centerXScaled:
            centerX,

          centerYScaled:
            centerY,

          radiusScaled:
            radius,

          cellX:
            x,

          cellY:
            y,

          physicsFixedScale:
            scale,
        })
      ) {
        return true;
      }
    }
  }


  return false;
}


module.exports = {
  projectileIntersectsTerrainV1,
};
