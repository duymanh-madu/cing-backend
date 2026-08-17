"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * MUZZLE ORIGIN AUTHORITY V1
 *
 * Canonical world semantics:
 *
 *   spawn_x / spawn_y
 *     = immutable character ground-contact anchor
 *
 *   +X = right
 *   +Y = down
 *
 *   horizontal fire direction
 *     = derived ONLY from shooter/opponent X
 *
 * Therefore:
 *
 *   origin_x_scaled
 *     =
 *     shooter_x * physics_fixed_scale
 *     +
 *     fire_direction_x_sign
 *     * muzzle_offset_forward_scaled
 *
 *   origin_y_scaled
 *     =
 *     shooter_y * physics_fixed_scale
 *     -
 *     muzzle_offset_up_scaled
 *
 * Muzzle offsets must already be canonical on the physics
 * fixed lattice through Muzzle Geometry Numeric V1.
 *
 * This module intentionally does NOT own:
 *
 *   map width / height bounds
 *   projectile velocity
 *   wind
 *   gravity
 *   timestep integration
 *   trajectory
 *   collision
 *   database state
 */

const {
  deriveHorizontalFireDirectionV1,
} =
  require(
    "./cingArtilleryFireDirectionV1"
  );

const {
  normalizeMuzzleGeometryRulesV1,
} =
  require(
    "./cingArtilleryMuzzleGeometryNumericV1"
  );


const POSTGRES_INTEGER_MAX =
  2147483647;


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_MUZZLE_ORIGIN_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function assertCoordinate(
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
        `Muzzle origin Cing Artillery không hợp lệ: ${field}`,
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
        "Muzzle origin Cing Artillery có physics_fixed_scale không hợp lệ",
    });
  }

  return value;
}


function deriveMuzzleOriginV1({
  shooterX,
  shooterY,
  opponentX,

  muzzleOffsetForwardPx,
  muzzleOffsetUpPx,

  physicsFixedScale,
}) {
  const shooterXCanonical =
    assertCoordinate(
      shooterX,
      "shooter_x"
    );

  const shooterYCanonical =
    assertCoordinate(
      shooterY,
      "shooter_y"
    );

  const opponentXCanonical =
    assertCoordinate(
      opponentX,
      "opponent_x"
    );

  const scale =
    assertPhysicsFixedScale(
      physicsFixedScale
    );


  const fireDirection =
    deriveHorizontalFireDirectionV1({
      shooterX:
        shooterXCanonical,

      opponentX:
        opponentXCanonical,
    });


  const geometry =
    normalizeMuzzleGeometryRulesV1({
      muzzleOffsetForwardPx,
      muzzleOffsetUpPx,
      physicsFixedScale:
        scale,
    });


  const scaleBigInt =
    BigInt(scale);

  const spawnXScaled =
    BigInt(
      shooterXCanonical
    ) *
    scaleBigInt;

  const spawnYScaled =
    BigInt(
      shooterYCanonical
    ) *
    scaleBigInt;


  const originXScaled =
    spawnXScaled +
    (
      fireDirection.x_sign *
      geometry.muzzle_offset_forward_scaled
    );

  const originYScaled =
    spawnYScaled -
    geometry.muzzle_offset_up_scaled;


  /*
   * World coordinates are canonical non-negative values.
   *
   * Full right/bottom map-bound checks intentionally belong
   * to a later world-boundary authority because this primitive
   * does not own map width or height.
   */
  if (
    originXScaled < 0n ||
    originYScaled < 0n
  ) {
    throw buildError({
      message:
        "Muzzle origin Cing Artillery nằm ngoài canonical non-negative world",
      code:
        "CING_ARTILLERY_MUZZLE_ORIGIN_NEGATIVE",
    });
  }


  return Object.freeze({
    spawn_x_scaled:
      spawnXScaled,

    spawn_y_scaled:
      spawnYScaled,

    muzzle_offset_forward_scaled:
      geometry.muzzle_offset_forward_scaled,

    muzzle_offset_up_scaled:
      geometry.muzzle_offset_up_scaled,

    fire_direction:
      fireDirection.direction,

    fire_direction_x_sign:
      fireDirection.x_sign,

    origin_x_scaled:
      originXScaled,

    origin_y_scaled:
      originYScaled,

    physics_fixed_scale:
      scaleBigInt,
  });
}


module.exports = {
  deriveMuzzleOriginV1,
};
