"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SHOT ANGLE CONVENTION V1
 *
 * Physics V1 canonical angle:
 *
 *   angle_deg is elevation ABOVE the shooter's
 *   LOCAL FORWARD HORIZONTAL axis.
 *
 * Therefore:
 *
 *   0 degrees
 *     = horizontal toward local forward
 *
 *   90 degrees
 *     = vertical upward
 *
 * Local forward horizontal is derived separately from
 * immutable shooter/opponent X:
 *
 *   opponent right => +X
 *   opponent left  => -X
 *
 * Canonical screen/world coordinates:
 *
 *   +X = right
 *   +Y = down
 *
 * Therefore the future launch-vector convention is:
 *
 *   horizontal =
 *     fireDirectionXSign * cos(angle)
 *
 *   vertical =
 *     -sin(angle)
 *
 * This module does NOT calculate sin/cos.
 * It only owns the angle semantic domain.
 */

const POSTGRES_INTEGER_MAX =
  2147483647;

const CING_ARTILLERY_SHOT_ANGLE_CONVENTION_V1 =
  Object.freeze({
    reference:
      "elevation_above_local_forward_horizontal",

    minimum_deg:
      0,

    maximum_deg:
      90,

    world_x_positive:
      "right",

    world_y_positive:
      "down",

    vertical_launch_sign:
      -1n,
  });


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_SHOT_ANGLE_CONVENTION_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    400;

  return error;
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
        "Shot angle convention Cing Artillery có physics_fixed_scale không hợp lệ",
    });
  }

  return value;
}


function assertScaledAngle(
  value,
  field
) {
  if (
    typeof value !== "bigint"
  ) {
    throw buildError({
      message:
        `Shot angle convention Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function assertShotAngleConventionV1({
  angleMinDegScaled,
  angleMaxDegScaled,
  physicsFixedScale,
}) {
  const scale =
    assertPhysicsFixedScale(
      physicsFixedScale
    );

  const minimum =
    assertScaledAngle(
      angleMinDegScaled,
      "angle_min_deg_scaled"
    );

  const maximum =
    assertScaledAngle(
      angleMaxDegScaled,
      "angle_max_deg_scaled"
    );

  const canonicalMinimum =
    0n;

  const canonicalMaximum =
    90n *
    BigInt(scale);

  if (
    minimum < canonicalMinimum ||
    maximum > canonicalMaximum ||
    maximum < minimum
  ) {
    throw buildError({
      message:
        "Shot angle convention Cing Artillery yêu cầu canonical range nằm trong [0, 90] độ",
    });
  }

  return Object.freeze({
    angle_min_deg_scaled:
      minimum,

    angle_max_deg_scaled:
      maximum,

    canonical_min_deg_scaled:
      canonicalMinimum,

    canonical_max_deg_scaled:
      canonicalMaximum,

    reference:
      CING_ARTILLERY_SHOT_ANGLE_CONVENTION_V1.reference,

    world_x_positive:
      CING_ARTILLERY_SHOT_ANGLE_CONVENTION_V1.world_x_positive,

    world_y_positive:
      CING_ARTILLERY_SHOT_ANGLE_CONVENTION_V1.world_y_positive,

    vertical_launch_sign:
      CING_ARTILLERY_SHOT_ANGLE_CONVENTION_V1.vertical_launch_sign,
  });
}


module.exports = {
  CING_ARTILLERY_SHOT_ANGLE_CONVENTION_V1,
  assertShotAngleConventionV1,
};
