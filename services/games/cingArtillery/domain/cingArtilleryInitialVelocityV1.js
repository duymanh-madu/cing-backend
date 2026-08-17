"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * INITIAL VELOCITY AUTHORITY V1
 *
 * Input:
 *
 *   canonical power
 *   canonical power_velocity_scale
 *   normalized world launch direction
 *
 * Output:
 *
 *   vx_scaled
 *   vy_scaled
 *
 * on physics_fixed_scale.
 *
 * Deterministic rounding contract:
 *
 *   1. compute non-negative speed magnitude with FLOOR
 *   2. compute non-negative component magnitudes with FLOOR
 *   3. apply direction signs only after magnitude rounding
 *
 * This preserves exact left/right mirror symmetry.
 *
 * Do NOT floor signed components directly.
 *
 * This module intentionally does NOT own:
 *
 *   muzzle position
 *   wind
 *   gravity
 *   timestep integration
 *   trajectory
 *   collision
 *   database state
 */

const {
  floorDivBigInt,
  absBigInt,
} =
  require(
    "./cingArtilleryFixedPoint"
  );

const {
  normalizeShotPowerV1,
} =
  require(
    "./cingArtilleryPowerNumericV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_INITIAL_VELOCITY_V1",
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
    typeof value !== "bigint"
  ) {
    throw buildError({
      message:
        `Initial velocity Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function assertPositiveSafeInteger(
  value,
  field
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw buildError({
      message:
        `Initial velocity Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function signOfBigInt(
  value
) {
  if (value > 0n) {
    return 1n;
  }

  if (value < 0n) {
    return -1n;
  }

  return 0n;
}


function deriveInitialVelocityV1({
  power,

  powerMin,
  powerMax,
  powerVelocityScale,

  physicsFixedScale,

  directionXScaled,
  directionYScaled,
  directionValueScale,
}) {
  const physicsScale =
    BigInt(
      assertPositiveSafeInteger(
        physicsFixedScale,
        "physics_fixed_scale"
      )
    );


  const directionScale =
    assertBigInt(
      directionValueScale,
      "direction_value_scale"
    );

  if (directionScale <= 0n) {
    throw buildError({
      message:
        "Initial velocity Cing Artillery có direction_value_scale không hợp lệ",
    });
  }


  const directionX =
    assertBigInt(
      directionXScaled,
      "direction_x_scaled"
    );

  const directionY =
    assertBigInt(
      directionYScaled,
      "direction_y_scaled"
    );


  /*
   * Defensive domain guard:
   *
   * a normalized direction component cannot exceed the
   * direction scale in magnitude.
   */
  if (
    absBigInt(
      directionX
    ) >
      directionScale ||
    absBigInt(
      directionY
    ) >
      directionScale
  ) {
    throw buildError({
      message:
        "Initial velocity Cing Artillery nhận launch direction ngoài normalized domain",
      code:
        "CING_ARTILLERY_INITIAL_VELOCITY_DIRECTION_OUT_OF_RANGE",
    });
  }


  const powerContract =
    normalizeShotPowerV1({
      power,
      powerMin,
      powerMax,
      powerVelocityScale,
      physicsFixedScale,
    });


  /*
   * Unit derivation:
   *
   * power_scaled
   *   = power * physics_fixed_scale
   *
   * power_velocity_scale_scaled
   *   = power_velocity_scale * physics_fixed_scale
   *
   * therefore:
   *
   * speed_scaled
   *   =
   *   floor(
   *     power_scaled
   *     * power_velocity_scale_scaled
   *     / physics_fixed_scale
   *   )
   *
   * yields velocity magnitude on physics_fixed_scale.
   */
  const speedScaled =
    floorDivBigInt(
      powerContract.power_scaled *
        powerContract.power_velocity_scale_scaled,

      physicsScale
    );


  if (speedScaled < 0n) {
    throw buildError({
      message:
        "Initial velocity Cing Artillery sinh speed âm",
      code:
        "CING_ARTILLERY_INITIAL_VELOCITY_NEGATIVE_SPEED",
    });
  }


  /*
   * Magnitude-first component rounding.
   *
   * This is deliberate:
   *
   *   right: +floor(magnitude)
   *   left:  -floor(magnitude)
   *
   * instead of:
   *
   *   floor(+value)
   *   floor(-value)
   *
   * which would differ by one unit for fractional signed
   * values.
   */
  const vxMagnitude =
    floorDivBigInt(
      speedScaled *
        absBigInt(
          directionX
        ),

      directionScale
    );

  const vyMagnitude =
    floorDivBigInt(
      speedScaled *
        absBigInt(
          directionY
        ),

      directionScale
    );


  const vx =
    signOfBigInt(
      directionX
    ) *
    vxMagnitude;

  const vy =
    signOfBigInt(
      directionY
    ) *
    vyMagnitude;


  return Object.freeze({
    power_scaled:
      powerContract.power_scaled,

    power_velocity_scale_scaled:
      powerContract.power_velocity_scale_scaled,

    speed_scaled:
      speedScaled,

    vx_scaled:
      vx,

    vy_scaled:
      vy,

    physics_fixed_scale:
      physicsScale,

    direction_value_scale:
      directionScale,
  });
}


module.exports = {
  deriveInitialVelocityV1,
};
