"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SWEPT PROJECTILE VS PLAYER EARLIEST CONTACT V1
 *
 * Semantic binding:
 *
 *   projectile center motion segment
 *          vs
 *   stationary player circle
 *
 * Projectile radius is applied through exact Minkowski
 * expansion:
 *
 *   combined_radius =
 *     projectile_radius_scaled +
 *     player_radius_scaled
 *
 * Then Segment-vs-Circle Earliest Contact Parameter V1
 * owns the exact geometry and parameter extraction.
 *
 * Return:
 *
 *   null
 *
 * or canonical ContactParameterV1 in:
 *
 *   0 <= t <= 1
 *
 * This adapter intentionally does NOT duplicate the
 * existing private trajectory/collider normalizers.
 *
 * It validates only the binding envelope and radii that
 * it directly owns. Coordinate scalar validation remains
 * owned by the segment/circle earliest-contact primitive.
 *
 * This module does NOT:
 *
 *   modify boolean swept-player authority
 *   identify player accounts
 *   decide shooter/opponent semantics
 *   decide self-damage
 *   inspect terrain
 *   inspect bitmasks
 *   classify out_of_bounds
 *   decide collision precedence
 *   calculate impact coordinates
 *   calculate damage
 *   sample trajectory
 *   mutate gameplay
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  segmentCircleEarliestContactParameterV1,
} =
  require(
    "./cingArtillerySegmentCircleEarliestContactParameterV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_SWEPT_PROJECTILE_PLAYER_EARLIEST_CONTACT_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function assertObject(
  value,
  field
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    throw buildError({
      message:
        `Swept projectile/player earliest contact Cing Artillery thiếu ${field}`,
    });
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
        `Swept projectile/player earliest contact Cing Artillery yêu cầu ${field} là BigInt dương`,
    });
  }

  return value;
}


function sweptProjectilePlayerEarliestContactV1({
  trajectorySegment,
  projectileRadiusScaled,
  playerCollider,
}) {
  const segment =
    assertObject(
      trajectorySegment,
      "canonical trajectory segment"
    );

  const player =
    assertObject(
      playerCollider,
      "canonical player collider"
    );

  const projectileRadius =
    assertPositiveBigInt(
      projectileRadiusScaled,
      "projectile_radius_scaled"
    );

  const playerRadius =
    assertPositiveBigInt(
      player.radius_scaled,
      "player_collider.radius_scaled"
    );


  const combinedRadius =
    projectileRadius +
    playerRadius;


  return segmentCircleEarliestContactParameterV1({
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
  sweptProjectilePlayerEarliestContactV1,
};
