"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * CIRCLE VS PIXEL CELL CONTACT V1
 *
 * Canonical map coordinates:
 *
 *   origin = top-left
 *   +X = right
 *   +Y = down
 *
 * IMPORTANT:
 *
 * Point ownership and geometric contact are intentionally
 * different concepts.
 *
 * Point ownership:
 *
 *   pixel x owns [x, x + 1)
 *
 * Geometric solid pixel:
 *
 *   pixel (x, y) occupies the closed collision square:
 *
 *     [x, x + 1] × [y, y + 1]
 *
 * The closed boundary is deliberate:
 *
 *   exact tangent contact with a pixel edge or corner
 *   counts as geometric contact.
 *
 * All physical calculations remain exact BigInt values on
 * physics_fixed_scale.
 *
 * Circle-vs-cell contact:
 *
 *   1. derive cell AABB in scaled coordinates
 *   2. clamp circle center to that closed AABB
 *   3. compare squared distance to radius²
 *
 * No sqrt or floating-point arithmetic is permitted.
 *
 * This module owns ONLY instantaneous circle-vs-pixel-cell
 * geometry.
 *
 * It does NOT:
 *
 *   inspect collision masks
 *   decide whether a cell is terrain
 *   enumerate candidate cells
 *   classify map bounds
 *   classify gameplay out_of_bounds
 *   sample trajectory
 *   perform swept collision
 *   determine collision precedence
 *   produce terrain_hit
 *   produce player_hit
 *   calculate damage
 *   mutate gameplay
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  clampBigInt,
} =
  require(
    "./cingArtilleryFixedPoint"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_CIRCLE_PIXEL_CELL_CONTACT_V1",
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
        `Circle/pixel contact Cing Artillery không hợp lệ: ${field}`,
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
        `Circle/pixel contact Cing Artillery yêu cầu ${field} > 0`,
    });
  }

  return normalized;
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
    value <= 0
  ) {
    throw buildError({
      message:
        "Circle/pixel contact Cing Artillery có physics_fixed_scale không hợp lệ",
    });
  }

  return value;
}


function circleIntersectsPixelCellV1({
  centerXScaled,
  centerYScaled,
  radiusScaled,

  cellX,
  cellY,

  physicsFixedScale,
}) {
  const centerX =
    assertBigInt(
      centerXScaled,
      "center_x_scaled"
    );

  const centerY =
    assertBigInt(
      centerYScaled,
      "center_y_scaled"
    );

  const radius =
    assertPositiveBigInt(
      radiusScaled,
      "radius_scaled"
    );

  const x =
    assertBigInt(
      cellX,
      "cell_x"
    );

  const y =
    assertBigInt(
      cellY,
      "cell_y"
    );

  const scale =
    BigInt(
      assertPhysicsFixedScale(
        physicsFixedScale
      )
    );


  const minX =
    x * scale;

  const minY =
    y * scale;

  const maxX =
    (x + 1n) *
    scale;

  const maxY =
    (y + 1n) *
    scale;


  const closestX =
    clampBigInt(
      centerX,
      minX,
      maxX
    );

  const closestY =
    clampBigInt(
      centerY,
      minY,
      maxY
    );


  const dx =
    centerX -
    closestX;

  const dy =
    centerY -
    closestY;

  const distanceSquared =
    dx * dx +
    dy * dy;

  const radiusSquared =
    radius *
    radius;


  return (
    distanceSquared <=
    radiusSquared
  );
}


module.exports = {
  circleIntersectsPixelCellV1,
};
