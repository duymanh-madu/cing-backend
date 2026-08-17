"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * HORIZONTAL FIRE DIRECTION V1
 *
 * Canonical map coordinate system:
 *
 *   +X = right
 *
 * Side A / B is NOT directional.
 *
 * Direction derives only from immutable shooter/opponent X:
 *
 *   opponentX > shooterX => right / +1
 *   opponentX < shooterX => left  / -1
 *
 * Equal X is invalid for Physics V1.
 */

const CING_ARTILLERY_FIRE_DIRECTION_V1 =
  Object.freeze({
    LEFT:
      "left",

    RIGHT:
      "right",
  });

function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_FIRE_DIRECTION",
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
    value < 0
  ) {
    throw buildError({
      message:
        `Fire direction Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}

function deriveHorizontalFireDirectionV1({
  shooterX,
  opponentX,
}) {
  const shooter =
    assertCoordinate(
      shooterX,
      "shooter_x"
    );

  const opponent =
    assertCoordinate(
      opponentX,
      "opponent_x"
    );

  if (shooter === opponent) {
    throw buildError({
      message:
        "Fire direction Cing Artillery không xác định vì shooter/opponent có cùng X",
      code:
        "CING_ARTILLERY_HORIZONTAL_FIRE_DIRECTION_UNDEFINED",
    });
  }

  if (opponent > shooter) {
    return Object.freeze({
      direction:
        CING_ARTILLERY_FIRE_DIRECTION_V1.RIGHT,

      x_sign:
        1n,
    });
  }

  return Object.freeze({
    direction:
      CING_ARTILLERY_FIRE_DIRECTION_V1.LEFT,

    x_sign:
      -1n,
  });
}

module.exports = {
  CING_ARTILLERY_FIRE_DIRECTION_V1,
  deriveHorizontalFireDirectionV1,
};
