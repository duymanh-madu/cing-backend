"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * COLLISION GEOMETRY NUMERIC AUTHORITY V1
 *
 * Owns canonical fixed-point representation of:
 *
 *   projectile_radius_px
 *   player_hit_radius_px
 *   player_hit_center_offset_y_px
 *
 * All three values must:
 *
 *   be > 0
 *   be exactly representable on physics_fixed_scale
 *   remain inside canonical fixed-point safe magnitude
 *
 * This module does NOT:
 *
 *   derive a player center
 *   map scaled coordinates to pixels
 *   inspect terrain
 *   perform collision
 *   classify OOB
 *   calculate trajectory
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  toScaledBigInt,
} =
  require(
    "./cingArtilleryFixedPoint"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_COLLISION_GEOMETRY_NUMERIC_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    400;

  return error;
}


function normalizeCollisionGeometryRulesV1({
  projectileRadiusPx,
  playerHitRadiusPx,
  playerHitCenterOffsetYPx,
  physicsFixedScale,
}) {
  const projectileRadius =
    toScaledBigInt(
      projectileRadiusPx,
      physicsFixedScale,
      "projectile_radius_px"
    );

  const playerHitRadius =
    toScaledBigInt(
      playerHitRadiusPx,
      physicsFixedScale,
      "player_hit_radius_px"
    );

  const playerHitCenterOffsetY =
    toScaledBigInt(
      playerHitCenterOffsetYPx,
      physicsFixedScale,
      "player_hit_center_offset_y_px"
    );


  if (
    projectileRadius <= 0n ||
    playerHitRadius <= 0n ||
    playerHitCenterOffsetY <= 0n
  ) {
    throw buildError({
      message:
        "Collision geometry Cing Artillery yêu cầu radius/offset > 0",
    });
  }


  return Object.freeze({
    projectile_radius_scaled:
      projectileRadius,

    player_hit_radius_scaled:
      playerHitRadius,

    player_hit_center_offset_y_scaled:
      playerHitCenterOffsetY,
  });
}


module.exports = {
  normalizeCollisionGeometryRulesV1,
};
