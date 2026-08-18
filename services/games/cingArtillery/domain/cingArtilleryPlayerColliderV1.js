"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * PLAYER COLLIDER DERIVATION V1
 *
 * Canonical world semantics:
 *
 *   coordinate origin = top-left
 *   +X = right
 *   +Y = down
 *
 *   combat-world spawn coordinate
 *     = character ground-contact pixel
 *
 * Therefore:
 *
 *   center_x =
 *     spawn_x
 *
 *   center_y =
 *     spawn_y - player_hit_center_offset_y
 *
 * The derived collider is a circle:
 *
 *   center_x_scaled
 *   center_y_scaled
 *   radius_scaled
 *
 * All physical coordinates remain on physics_fixed_scale.
 *
 * This module owns only deterministic collider derivation.
 *
 * It does NOT:
 *
 *   inspect map terrain
 *   inspect collision bitmask
 *   classify map bounds
 *   classify gameplay out_of_bounds
 *   perform projectile/player collision
 *   perform swept collision
 *   decide collision precedence
 *   calculate damage
 *   mutate gameplay
 *   access PostgreSQL
 *   access realtime transport
 *
 * A center may legitimately be negative when a ground-contact
 * spawn is close to the top map boundary. Bounds/collision
 * interpretation belongs to later authorities.
 */

const POSTGRES_INTEGER_MAX =
  2147483647;


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_PLAYER_COLLIDER_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function assertSpawnCoordinate(
  value,
  field
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > POSTGRES_INTEGER_MAX
  ) {
    throw buildError({
      message:
        `Player collider Cing Artillery có ${field} không hợp lệ`,
    });
  }

  return value;
}


function assertPhysicsFixedScale(
  value
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > POSTGRES_INTEGER_MAX
  ) {
    throw buildError({
      message:
        "Player collider Cing Artillery có physics_fixed_scale không hợp lệ",
    });
  }

  return value;
}


function assertPositiveScaledBigInt(
  value,
  field
) {
  if (
    typeof value !== "bigint" ||
    value <= 0n
  ) {
    throw buildError({
      message:
        `Player collider Cing Artillery có ${field} không hợp lệ`,
    });
  }

  return value;
}


function derivePlayerColliderV1({
  spawnX,
  spawnY,
  physicsFixedScale,
  playerHitRadiusScaled,
  playerHitCenterOffsetYScaled,
}) {
  const x =
    assertSpawnCoordinate(
      spawnX,
      "spawn_x"
    );

  const y =
    assertSpawnCoordinate(
      spawnY,
      "spawn_y"
    );

  const scale =
    assertPhysicsFixedScale(
      physicsFixedScale
    );

  const radius =
    assertPositiveScaledBigInt(
      playerHitRadiusScaled,
      "player_hit_radius_scaled"
    );

  const centerOffsetY =
    assertPositiveScaledBigInt(
      playerHitCenterOffsetYScaled,
      "player_hit_center_offset_y_scaled"
    );


  const scaleBigInt =
    BigInt(scale);

  const spawnXScaled =
    BigInt(x) *
    scaleBigInt;

  const spawnYScaled =
    BigInt(y) *
    scaleBigInt;

  const centerXScaled =
    spawnXScaled;

  const centerYScaled =
    spawnYScaled -
    centerOffsetY;


  return Object.freeze({
    spawn_x_scaled:
      spawnXScaled,

    spawn_y_scaled:
      spawnYScaled,

    center_x_scaled:
      centerXScaled,

    center_y_scaled:
      centerYScaled,

    radius_scaled:
      radius,
  });
}


module.exports = {
  derivePlayerColliderV1,
};
