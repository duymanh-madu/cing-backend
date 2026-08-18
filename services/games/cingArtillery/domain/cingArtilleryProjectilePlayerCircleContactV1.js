"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * PROJECTILE VS PLAYER CIRCLE CONTACT V1
 *
 * Canonical instantaneous geometry:
 *
 * projectile:
 *   center =
 *     projectile_x_scaled,
 *     projectile_y_scaled
 *
 *   radius =
 *     projectile_radius_scaled
 *
 * player:
 *   center =
 *     player collider center_x_scaled,
 *     player collider center_y_scaled
 *
 *   radius =
 *     player collider radius_scaled
 *
 * All values are exact BigInt values on the same
 * physics fixed-point lattice.
 *
 * Circle intersection mathematics is NOT duplicated here.
 * GeometryV1 remains the canonical primitive authority.
 *
 * Exact tangent contact counts as intersection.
 *
 * This module owns only projectile/player semantic binding
 * to the existing circle-intersection primitive.
 *
 * It does NOT:
 *
 *   sample trajectory
 *   build trajectory segments
 *   perform swept collision
 *   inspect terrain
 *   inspect bitmasks
 *   classify map bounds
 *   classify gameplay out_of_bounds
 *   identify target accounts
 *   decide self-damage
 *   decide collision precedence
 *   produce shot-resolution outcomes
 *   calculate damage
 *   mutate gameplay
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  circlesIntersect,
} =
  require(
    "./cingArtilleryGeometryV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_PROJECTILE_PLAYER_CIRCLE_CONTACT_V1",
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
        `Projectile/player contact Cing Artillery không hợp lệ: ${field}`,
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
        `Projectile/player contact Cing Artillery yêu cầu ${field} > 0`,
    });
  }

  return normalized;
}


function normalizePlayerCollider(
  playerCollider
) {
  if (
    !playerCollider ||
    typeof playerCollider !==
      "object" ||
    Array.isArray(
      playerCollider
    )
  ) {
    throw buildError({
      message:
        "Projectile/player contact Cing Artillery thiếu canonical player collider",
    });
  }

  return Object.freeze({
    center_x_scaled:
      assertBigInt(
        playerCollider
          .center_x_scaled,
        "player_collider.center_x_scaled"
      ),

    center_y_scaled:
      assertBigInt(
        playerCollider
          .center_y_scaled,
        "player_collider.center_y_scaled"
      ),

    radius_scaled:
      assertPositiveBigInt(
        playerCollider
          .radius_scaled,
        "player_collider.radius_scaled"
      ),
  });
}


function projectileIntersectsPlayerCircleV1({
  projectileXScaled,
  projectileYScaled,
  projectileRadiusScaled,
  playerCollider,
}) {
  const projectileX =
    assertBigInt(
      projectileXScaled,
      "projectile_x_scaled"
    );

  const projectileY =
    assertBigInt(
      projectileYScaled,
      "projectile_y_scaled"
    );

  const projectileRadius =
    assertPositiveBigInt(
      projectileRadiusScaled,
      "projectile_radius_scaled"
    );

  const player =
    normalizePlayerCollider(
      playerCollider
    );


  return circlesIntersect({
    ax:
      projectileX,

    ay:
      projectileY,

    radiusA:
      projectileRadius,

    bx:
      player.center_x_scaled,

    by:
      player.center_y_scaled,

    radiusB:
      player.radius_scaled,
  });
}


module.exports = {
  projectileIntersectsPlayerCircleV1,
};
