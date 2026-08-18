"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SWEPT PROJECTILE VS TERRAIN CONTACT V1
 *
 * Owns continuous projectile-circle contact against
 * canonical bitmask_v1 terrain for one trajectory segment.
 *
 * Pipeline:
 *
 *   trajectory segment + projectile radius
 *   -> exact swept broad-phase cell rectangle
 *   -> BigInt clip to map bounds
 *   -> validate bitmask exactly once
 *   -> O(1) solid-cell lookup
 *   -> exact segment-vs-rounded-pixel-cell narrow phase
 *
 * IMPORTANT:
 *
 * Projectile center may begin or end outside the map while
 * the swept circle still touches an edge terrain cell.
 *
 * Therefore map clipping applies to candidate terrain cells,
 * never to segment endpoints.
 *
 * This module owns ONLY boolean swept terrain contact.
 *
 * It does NOT:
 *
 *   calculate TOI
 *   calculate impact coordinates
 *   choose earliest terrain cell
 *   compare terrain/player precedence
 *   classify gameplay out_of_bounds
 *   produce shot resolution
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
  deriveAxisCandidateCellRangeV1,
} =
  require(
    "./cingArtilleryCircleCandidateCellRangeV1"
  );

const {
  createValidatedBitmaskViewV1,
} =
  require(
    "./cingArtilleryGeometryV1"
  );

const {
  segmentIntersectsRoundedPixelCellV1,
} =
  require(
    "./cingArtillerySegmentRoundedPixelCellContactV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_TERRAIN_CONTACT_V1",
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
        `Swept projectile terrain Cing Artillery không hợp lệ: ${field}`,
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
        `Swept projectile terrain Cing Artillery yêu cầu ${field} > 0`,
    });
  }

  return normalized;
}


function assertPositivePgInteger(
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
        `Swept projectile terrain Cing Artillery không hợp lệ: ${field}`,
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
        "Swept projectile terrain Cing Artillery có collision_mask không hợp lệ",
    });
  }

  return value;
}


function normalizeTrajectorySegment(
  trajectorySegment
) {
  if (
    !trajectorySegment ||
    typeof trajectorySegment !==
      "object" ||
    Array.isArray(
      trajectorySegment
    )
  ) {
    throw buildError({
      message:
        "Swept projectile terrain Cing Artillery thiếu canonical trajectory segment",
    });
  }

  return Object.freeze({
    start_x_scaled:
      assertBigInt(
        trajectorySegment
          .start_x_scaled,
        "trajectory_segment.start_x_scaled"
      ),

    start_y_scaled:
      assertBigInt(
        trajectorySegment
          .start_y_scaled,
        "trajectory_segment.start_y_scaled"
      ),

    end_x_scaled:
      assertBigInt(
        trajectorySegment
          .end_x_scaled,
        "trajectory_segment.end_x_scaled"
      ),

    end_y_scaled:
      assertBigInt(
        trajectorySegment
          .end_y_scaled,
        "trajectory_segment.end_y_scaled"
      ),
  });
}


function minBigInt(
  a,
  b
) {
  return a < b
    ? a
    : b;
}


function maxBigInt(
  a,
  b
) {
  return a > b
    ? a
    : b;
}


function sweptProjectileIntersectsTerrainV1({
  trajectorySegment,
  projectileRadiusScaled,

  physicsFixedScale,

  widthPx,
  heightPx,
  collisionMask,
}) {
  const segment =
    normalizeTrajectorySegment(
      trajectorySegment
    );

  const radius =
    assertPositiveBigInt(
      projectileRadiusScaled,
      "projectile_radius_scaled"
    );

  const scale =
    assertPositivePgInteger(
      physicsFixedScale,
      "physics_fixed_scale"
    );

  const width =
    assertPositivePgInteger(
      widthPx,
      "width_px"
    );

  const height =
    assertPositivePgInteger(
      heightPx,
      "height_px"
    );

  const mask =
    assertCollisionMask(
      collisionMask
    );


  const bitmaskView =
    createValidatedBitmaskViewV1({
      widthPx:
        width,

      heightPx:
        height,

      collisionMask:
        mask,
    });


  if (!bitmaskView) {
    throw buildError({
      message:
        "Swept projectile terrain Cing Artillery có bitmask_v1 không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_TERRAIN_BITMASK_V1",
    });
  }


  const minCenterX =
    minBigInt(
      segment.start_x_scaled,
      segment.end_x_scaled
    );

  const maxCenterX =
    maxBigInt(
      segment.start_x_scaled,
      segment.end_x_scaled
    );

  const minCenterY =
    minBigInt(
      segment.start_y_scaled,
      segment.end_y_scaled
    );

  const maxCenterY =
    maxBigInt(
      segment.start_y_scaled,
      segment.end_y_scaled
    );


  /*
   * deriveAxisCandidateCellRangeV1 already owns exact
   * closed-cell tangent semantics:
   *
   * min = floor((low - 1 lattice unit) / scale)
   * max = floor(high / scale)
   *
   * Use segment endpoint extrema as the swept center range.
   */
  const xMinRange =
    deriveAxisCandidateCellRangeV1({
      centerScaled:
        minCenterX,

      radiusScaled:
        radius,

      physicsFixedScale:
        scale,
    });

  const xMaxRange =
    deriveAxisCandidateCellRangeV1({
      centerScaled:
        maxCenterX,

      radiusScaled:
        radius,

      physicsFixedScale:
        scale,
    });

  const yMinRange =
    deriveAxisCandidateCellRangeV1({
      centerScaled:
        minCenterY,

      radiusScaled:
        radius,

      physicsFixedScale:
        scale,
    });

  const yMaxRange =
    deriveAxisCandidateCellRangeV1({
      centerScaled:
        maxCenterY,

      radiusScaled:
        radius,

      physicsFixedScale:
        scale,
    });


  const candidateMinX =
    minBigInt(
      xMinRange.min_cell,
      xMaxRange.min_cell
    );

  const candidateMaxX =
    maxBigInt(
      xMinRange.max_cell,
      xMaxRange.max_cell
    );

  const candidateMinY =
    minBigInt(
      yMinRange.min_cell,
      yMaxRange.min_cell
    );

  const candidateMaxY =
    maxBigInt(
      yMinRange.max_cell,
      yMaxRange.max_cell
    );


  const minX =
    maxBigInt(
      candidateMinX,
      0n
    );

  const minY =
    maxBigInt(
      candidateMinY,
      0n
    );

  const maxX =
    minBigInt(
      candidateMaxX,
      BigInt(
        width - 1
      )
    );

  const maxY =
    minBigInt(
      candidateMaxY,
      BigInt(
        height - 1
      )
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
       * Safe Number projection occurs only after BigInt
       * clipping to canonical map dimensions.
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
            "Swept projectile terrain Cing Artillery không thể project candidate cell an toàn",
          code:
            "CING_ARTILLERY_SWEPT_PROJECTILE_TERRAIN_UNSAFE_CELL_PROJECTION",
        });
      }


      if (
        !bitmaskView.isSolid({
          x:
            xPx,

          y:
            yPx,
        })
      ) {
        continue;
      }


      if (
        segmentIntersectsRoundedPixelCellV1({
          startXScaled:
            segment.start_x_scaled,

          startYScaled:
            segment.start_y_scaled,

          endXScaled:
            segment.end_x_scaled,

          endYScaled:
            segment.end_y_scaled,

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
  sweptProjectileIntersectsTerrainV1,
};
