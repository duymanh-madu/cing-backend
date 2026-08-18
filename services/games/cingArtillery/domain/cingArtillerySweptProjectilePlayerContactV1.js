"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SWEPT PROJECTILE VS PLAYER CONTACT V1
 *
 * Semantic binding:
 *
 *   projectile center motion segment
 *          vs
 *   stationary player circle
 *
 * Projectile radius is applied through Minkowski expansion:
 *
 *   combined_radius =
 *     projectile_radius_scaled +
 *     player_radius_scaled
 *
 * Then the exact canonical segment/circle primitive owns
 * the geometry.
 *
 * This prevents projectile tunneling between two adjacent
 * trajectory samples without introducing substeps,
 * floating point, sqrt, division, or approximation.
 *
 * Exact tangent contact counts as contact.
 *
 * This module owns ONLY swept projectile/player contact.
 *
 * It does NOT:
 *
 *   calculate time of impact
 *   calculate impact coordinates
 *   identify player accounts
 *   decide shooter/opponent semantics
 *   decide self-damage
 *   inspect terrain
 *   inspect bitmasks
 *   classify out_of_bounds
 *   decide terrain/player precedence
 *   produce shot resolution
 *   calculate damage
 *   sample trajectory
 *   mutate gameplay
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  segmentIntersectsCircleV1,
} =
  require(
    "./cingArtillerySegmentCircleContactV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_PLAYER_CONTACT_V1",
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
        `Swept projectile/player contact Cing Artillery không hợp lệ: ${field}`,
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
        `Swept projectile/player contact Cing Artillery yêu cầu ${field} > 0`,
    });
  }

  return normalized;
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
        "Swept projectile/player contact Cing Artillery thiếu canonical trajectory segment",
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
        "Swept projectile/player contact Cing Artillery thiếu canonical player collider",
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


function sweptProjectileIntersectsPlayerV1({
  trajectorySegment,
  projectileRadiusScaled,
  playerCollider,
}) {
  const segment =
    normalizeTrajectorySegment(
      trajectorySegment
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

  const combinedRadius =
    projectileRadius +
    player.radius_scaled;


  return segmentIntersectsCircleV1({
    startX:
      segment.start_x_scaled,

    startY:
      segment.start_y_scaled,

    endX:
      segment.end_x_scaled,

    endY:
      segment.end_y_scaled,

    circleX:
      player.center_x_scaled,

    circleY:
      player.center_y_scaled,

    radius:
      combinedRadius,
  });
}


module.exports = {
  sweptProjectileIntersectsPlayerV1,
};
