"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * PROJECTILE EXPANDED WORLD BOUNDS V1
 *
 * Canonical closed map rectangle:
 *
 *   [0, widthPx * physicsFixedScale]
 *   ×
 *   [0, heightPx * physicsFixedScale]
 *
 * A projectile circle still intersects this closed world
 * while its CENTER remains inside/on the Minkowski-expanded
 * closed AABB:
 *
 *   [-radius, width*scale + radius]
 *   ×
 *   [-radius, height*scale + radius]
 *
 * This module owns only canonical derivation and point
 * membership for that expanded center-domain.
 *
 * It does NOT:
 *
 *   inspect trajectory motion
 *   calculate exit parameters
 *   classify already_outside
 *   classify gameplay out_of_bounds
 *   inspect terrain
 *   inspect players
 *   decide precedence
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  POSTGRES_INTEGER_MAX,
} =
  require(
    "./cingArtilleryScaledToPixelBridgeV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_PROJECTILE_EXPANDED_WORLD_BOUNDS_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
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
        `Projectile expanded world Cing Artillery yêu cầu ${field} > 0`,
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
        `Projectile expanded world Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
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
        `Projectile expanded world Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function deriveProjectileExpandedWorldBoundsV1({
  projectileRadiusScaled,
  physicsFixedScale,
  widthPx,
  heightPx,
} = {}) {
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


  return Object.freeze({
    min_x_scaled:
      -radius,

    min_y_scaled:
      -radius,

    max_x_scaled:
      worldWidthScaled +
      radius,

    max_y_scaled:
      worldHeightScaled +
      radius,

    world_width_scaled:
      worldWidthScaled,

    world_height_scaled:
      worldHeightScaled,

    projectile_radius_scaled:
      radius,

    physics_fixed_scale:
      scaleBigInt,
  });
}


function pointInsideProjectileExpandedWorldV1({
  xScaled,
  yScaled,
  expandedWorldBounds,
} = {}) {
  const x =
    assertBigInt(
      xScaled,
      "x_scaled"
    );

  const y =
    assertBigInt(
      yScaled,
      "y_scaled"
    );


  if (
    !expandedWorldBounds ||
    typeof expandedWorldBounds !==
      "object" ||
    Array.isArray(
      expandedWorldBounds
    )
  ) {
    throw buildError({
      message:
        "Projectile expanded world Cing Artillery thiếu expanded_world_bounds",
    });
  }


  const minX =
    assertBigInt(
      expandedWorldBounds.min_x_scaled,
      "expanded_world_bounds.min_x_scaled"
    );

  const minY =
    assertBigInt(
      expandedWorldBounds.min_y_scaled,
      "expanded_world_bounds.min_y_scaled"
    );

  const maxX =
    assertBigInt(
      expandedWorldBounds.max_x_scaled,
      "expanded_world_bounds.max_x_scaled"
    );

  const maxY =
    assertBigInt(
      expandedWorldBounds.max_y_scaled,
      "expanded_world_bounds.max_y_scaled"
    );


  if (
    minX > maxX ||
    minY > maxY
  ) {
    throw buildError({
      message:
        "Projectile expanded world Cing Artillery có bounds không hợp lệ",
    });
  }


  return (
    x >= minX &&
    x <= maxX &&
    y >= minY &&
    y <= maxY
  );
}


module.exports = {
  deriveProjectileExpandedWorldBoundsV1,
  pointInsideProjectileExpandedWorldV1,
};
