"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * DETERMINISTIC CORDIC ROTATION KERNEL V1
 *
 * Input:
 *
 *   angleTrigUnits
 *
 * expressed on the canonical Trig Algorithm V1 angular
 * lattice:
 *
 *   1 degree = 1,000,000,000 units
 *
 * Supported semantic domain:
 *
 *   0 <= angle <= 90 degrees
 *
 * Output:
 *
 *   cos_scaled
 *   sin_scaled
 *
 * expressed on:
 *
 *   trig_value_scale = 1,000,000,000
 *
 * Scope:
 *
 *   local first-quadrant deterministic trig only
 *
 * This module intentionally does NOT know:
 *
 *   shooter position
 *   opponent position
 *   fire direction
 *   screen/world Y orientation
 *   power
 *   velocity
 *   wind
 *   gravity
 *   trajectory
 *   collision
 *
 * No Number conversion.
 * No floating-point trig.
 * No Math.sin/cos/tan/atan.
 */

const {
  floorDivBigInt,
} =
  require(
    "./cingArtilleryFixedPoint"
  );

const {
  CORDIC_ITERATIONS_V1,
  TRIG_ANGLE_SCALE_V1,
  TRIG_VALUE_SCALE_V1,
} =
  require(
    "./cingArtilleryTrigAlgorithmV1Contract"
  );

const {
  CORDIC_ATAN_DEG_UNITS_V1,
  CORDIC_INVERSE_GAIN_VALUE_UNITS_V1,
} =
  require(
    "./cingArtilleryCordicConstantsV1.generated"
  );


const CORDIC_MIN_ANGLE_UNITS_V1 =
  0n;

const CORDIC_MAX_ANGLE_UNITS_V1 =
  90n *
  BigInt(
    TRIG_ANGLE_SCALE_V1
  );

const CORDIC_VALUE_SCALE_BIGINT_V1 =
  BigInt(
    TRIG_VALUE_SCALE_V1
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_CORDIC_ROTATION_V1",
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
        `CORDIC rotation Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function assertShiftCount(
  value
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value >= CORDIC_ITERATIONS_V1
  ) {
    throw buildError({
      message:
        "CORDIC rotation Cing Artillery có shift count không hợp lệ",
      code:
        "CING_ARTILLERY_CORDIC_SHIFT_INVALID",
    });
  }

  return value;
}


/*
 * Canonical signed right-shift semantics for CORDIC V1.
 *
 * Mathematical meaning:
 *
 *   floor(value / 2^shift)
 *
 * This is intentionally explicit rather than relying on
 * scattered JavaScript signed >> behavior inside the kernel.
 *
 * The denominator is positive, so floorDivBigInt owns all
 * negative-value floor semantics.
 */
function arithmeticShiftRightFloorBigIntV1(
  value,
  shift
) {
  const integer =
    assertBigInt(
      value,
      "shift_value"
    );

  const count =
    assertShiftCount(
      shift
    );

  const divisor =
    1n <<
    BigInt(count);

  return floorDivBigInt(
    integer,
    divisor
  );
}


function assertCordicRuntimeIdentityV1() {
  if (
    CORDIC_ITERATIONS_V1 !== 32 ||
    CORDIC_ATAN_DEG_UNITS_V1.length !==
      CORDIC_ITERATIONS_V1 ||
    TRIG_ANGLE_SCALE_V1 !==
      1000000000 ||
    TRIG_VALUE_SCALE_V1 !==
      1000000000 ||
    CORDIC_INVERSE_GAIN_VALUE_UNITS_V1 !==
      607252935n
  ) {
    throw buildError({
      message:
        "CORDIC rotation Cing Artillery có algorithm identity không nhất quán",
      code:
        "CING_ARTILLERY_CORDIC_IDENTITY_MISMATCH",
    });
  }
}


function rotateCordicFirstQuadrantV1({
  angleTrigUnits,
}) {
  assertCordicRuntimeIdentityV1();

  const angle =
    assertBigInt(
      angleTrigUnits,
      "angle_trig_units"
    );

  if (
    angle <
      CORDIC_MIN_ANGLE_UNITS_V1 ||
    angle >
      CORDIC_MAX_ANGLE_UNITS_V1
  ) {
    throw buildError({
      message:
        "CORDIC rotation Cing Artillery chỉ hỗ trợ angle [0,90] độ",
      code:
        "CING_ARTILLERY_CORDIC_ANGLE_OUT_OF_RANGE",
    });
  }


  /*
   * Cardinal axes are semantic identities.
   *
   * Do not allow finite-iteration approximation error at
   * exact 0° and 90°.
   */
  if (
    angle ===
    CORDIC_MIN_ANGLE_UNITS_V1
  ) {
    return Object.freeze({
      cos_scaled:
        CORDIC_VALUE_SCALE_BIGINT_V1,

      sin_scaled:
        0n,

      residual_angle_units:
        0n,
    });
  }

  if (
    angle ===
    CORDIC_MAX_ANGLE_UNITS_V1
  ) {
    return Object.freeze({
      cos_scaled:
        0n,

      sin_scaled:
        CORDIC_VALUE_SCALE_BIGINT_V1,

      residual_angle_units:
        0n,
    });
  }


  let x =
    CORDIC_INVERSE_GAIN_VALUE_UNITS_V1;

  let y =
    0n;

  let z =
    angle;


  for (
    let iteration = 0;
    iteration <
      CORDIC_ITERATIONS_V1;
    iteration += 1
  ) {
    const xShift =
      arithmeticShiftRightFloorBigIntV1(
        x,
        iteration
      );

    const yShift =
      arithmeticShiftRightFloorBigIntV1(
        y,
        iteration
      );

    const microAngle =
      CORDIC_ATAN_DEG_UNITS_V1[
        iteration
      ];

    /*
     * z >= 0:
     *
     *   rotate positively
     *
     * z < 0:
     *
     *   rotate negatively
     *
     * Inputs are first-quadrant elevations, but residual z
     * naturally crosses zero during convergence.
     */
    if (z >= 0n) {
      const nextX =
        x -
        yShift;

      const nextY =
        y +
        xShift;

      x =
        nextX;

      y =
        nextY;

      z -=
        microAngle;
    } else {
      const nextX =
        x +
        yShift;

      const nextY =
        y -
        xShift;

      x =
        nextX;

      y =
        nextY;

      z +=
        microAngle;
    }
  }


  return Object.freeze({
    cos_scaled:
      x,

    sin_scaled:
      y,

    residual_angle_units:
      z,
  });
}


module.exports = {
  CORDIC_MIN_ANGLE_UNITS_V1,
  CORDIC_MAX_ANGLE_UNITS_V1,

  arithmeticShiftRightFloorBigIntV1,

  rotateCordicFirstQuadrantV1,
};
