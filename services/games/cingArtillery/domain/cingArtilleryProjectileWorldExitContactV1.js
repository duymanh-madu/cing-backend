"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * PROJECTILE WORLD EXIT CONTACT V1
 *
 * Canonical map geometry:
 *
 *   [0, widthPx * physicsFixedScale]
 *   ×
 *   [0, heightPx * physicsFixedScale]
 *
 * A projectile remains geometrically attached to the world
 * while its CLOSED circle intersects that closed rectangle.
 *
 * Therefore the projectile CENTER remains world-eligible
 * inside the Minkowski-expanded closed AABB:
 *
 *   [-radius, width*scale + radius]
 *   ×
 *   [-radius, height*scale + radius]
 *
 * Return:
 *
 *   null
 *
 *     segment does not leave the expanded world
 *
 *   ContactParameterV1
 *
 *     exact parameter where the center reaches the final
 *     closed-world tangent boundary before moving outside
 *
 * Special case:
 *
 *   start already outside expanded world
 *     -> canonical 0/1
 *
 * This is intentional gameplay/world geometry.
 *
 * It does NOT:
 *
 *   inspect terrain
 *   inspect players
 *   choose collision precedence
 *   produce shot-resolution outcome
 *   calculate impact coordinates
 *   calculate target or damage
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
  createRationalContactParameterV1,
} =
  require(
    "./cingArtilleryContactParameterV1"
  );

const {
  segmentClosedAabbExitContactParameterV1,
} =
  require(
    "./cingArtillerySegmentClosedAabbExitContactParameterV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_PROJECTILE_WORLD_EXIT_CONTACT_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function assertTrajectorySegment(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    throw buildError({
      message:
        "Projectile world exit Cing Artillery thiếu trajectory_segment",
    });
  }


  const fields = [
    "start_x_scaled",
    "start_y_scaled",
    "end_x_scaled",
    "end_y_scaled",
  ];


  for (
    const field
    of fields
  ) {
    if (
      typeof value[field] !==
        "bigint"
    ) {
      throw buildError({
        message:
          `Projectile world exit Cing Artillery không hợp lệ: trajectory_segment.${field}`,
      });
    }
  }


  return value;
}


function assertPositiveBigInt(
  value,
  field
) {
  if (
    typeof value !==
      "bigint" ||
    value <= 0n
  ) {
    throw buildError({
      message:
        `Projectile world exit Cing Artillery yêu cầu ${field} > 0`,
    });
  }


  return value;
}


function assertPositivePostgresInteger(
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
        `Projectile world exit Cing Artillery không hợp lệ: ${field}`,
    });
  }


  return value;
}


function pointInsideClosedAabb({
  x,
  y,
  minX,
  minY,
  maxX,
  maxY,
}) {
  return (
    x >= minX &&
    x <= maxX &&
    y >= minY &&
    y <= maxY
  );
}


function projectileWorldExitContactV1({
  trajectorySegment,
  projectileRadiusScaled,
  physicsFixedScale,
  widthPx,
  heightPx,
} = {}) {
  const segment =
    assertTrajectorySegment(
      trajectorySegment
    );

  const radius =
    assertPositiveBigInt(
      projectileRadiusScaled,
      "projectile_radius_scaled"
    );

  const scale =
    assertPositivePostgresInteger(
      physicsFixedScale,
      "physics_fixed_scale"
    );

  const width =
    assertPositivePostgresInteger(
      widthPx,
      "width_px"
    );

  const height =
    assertPositivePostgresInteger(
      heightPx,
      "height_px"
    );


  const scaleBigInt =
    BigInt(scale);

  const worldWidthScaled =
    BigInt(width) *
    scaleBigInt;

  const worldHeightScaled =
    BigInt(height) *
    scaleBigInt;


  const minX =
    -radius;

  const minY =
    -radius;

  const maxX =
    worldWidthScaled +
    radius;

  const maxY =
    worldHeightScaled +
    radius;


  const startInside =
    pointInsideClosedAabb({
      x:
        segment.start_x_scaled,

      y:
        segment.start_y_scaled,

      minX,
      minY,
      maxX,
      maxY,
    });


  /*
   * Already fully outside the expanded world:
   *
   * gameplay OOB exists at the beginning of this segment.
   *
   * Do not pass this case to the generic exit primitive,
   * whose contract correctly requires start inside/on.
   */
  if (!startInside) {
    return createRationalContactParameterV1({
      numerator:
        0n,

      denominator:
        1n,
    });
  }


  return segmentClosedAabbExitContactParameterV1({
    startX:
      segment.start_x_scaled,

    startY:
      segment.start_y_scaled,

    endX:
      segment.end_x_scaled,

    endY:
      segment.end_y_scaled,

    minX,
    minY,
    maxX,
    maxY,
  });
}


module.exports = {
  projectileWorldExitContactV1,
};
