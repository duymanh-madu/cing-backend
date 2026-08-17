"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * ANGLE GRID AUTHORITY V1
 *
 * V2 angle values are canonical only when:
 *
 *   - min / max / step / shot angle are exactly representable
 *     on physics_fixed_scale
 *
 *   - angle_step_deg > 0
 *
 *   - angle_max_deg >= angle_min_deg
 *
 *   - the complete configured range is divisible by step
 *
 *   - an accepted shot lies exactly on:
 *
 *       angle_min_deg + N * angle_step_deg
 *
 * No implicit rounding is permitted.
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
    "CING_ARTILLERY_INVALID_ANGLE_GRID",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    400;

  return error;
}

function normalizeAngleGridRulesV1({
  angleMinDeg,
  angleMaxDeg,
  angleStepDeg,
  physicsFixedScale,
}) {
  const min =
    toScaledBigInt(
      angleMinDeg,
      physicsFixedScale,
      "angle_min_deg"
    );

  const max =
    toScaledBigInt(
      angleMaxDeg,
      physicsFixedScale,
      "angle_max_deg"
    );

  const step =
    toScaledBigInt(
      angleStepDeg,
      physicsFixedScale,
      "angle_step_deg"
    );

  if (step <= 0n) {
    throw buildError({
      message:
        "Angle grid Cing Artillery có angle_step_deg không hợp lệ",
    });
  }

  if (max < min) {
    throw buildError({
      message:
        "Angle grid Cing Artillery có range không hợp lệ",
    });
  }

  const span =
    max - min;

  if (
    span %
      step !==
    0n
  ) {
    throw buildError({
      message:
        "Angle grid Cing Artillery không chia hết range",
      code:
        "CING_ARTILLERY_ANGLE_GRID_RANGE_MISALIGNED",
    });
  }

  return Object.freeze({
    angle_min_deg_scaled:
      min,

    angle_max_deg_scaled:
      max,

    angle_step_deg_scaled:
      step,

    step_count:
      span /
      step,
  });
}

function normalizeAngleOnGridV1({
  angleDeg,
  angleMinDeg,
  angleMaxDeg,
  angleStepDeg,
  physicsFixedScale,
}) {
  const grid =
    normalizeAngleGridRulesV1({
      angleMinDeg,
      angleMaxDeg,
      angleStepDeg,
      physicsFixedScale,
    });

  const angle =
    toScaledBigInt(
      angleDeg,
      physicsFixedScale,
      "angle_deg"
    );

  if (
    angle <
      grid.angle_min_deg_scaled ||
    angle >
      grid.angle_max_deg_scaled
  ) {
    throw buildError({
      message:
        "Shot angle Cing Artillery nằm ngoài angle grid range",
      code:
        "CING_ARTILLERY_SHOT_ANGLE_OUT_OF_GRID_RANGE",
    });
  }

  const offset =
    angle -
    grid.angle_min_deg_scaled;

  if (
    offset %
      grid.angle_step_deg_scaled !==
    0n
  ) {
    throw buildError({
      message:
        "Shot angle Cing Artillery không nằm trên canonical grid",
      code:
        "CING_ARTILLERY_SHOT_ANGLE_NOT_ON_GRID",
    });
  }

  return Object.freeze({
    angle_deg_scaled:
      angle,

    angle_min_deg_scaled:
      grid.angle_min_deg_scaled,

    angle_max_deg_scaled:
      grid.angle_max_deg_scaled,

    angle_step_deg_scaled:
      grid.angle_step_deg_scaled,

    step_index:
      offset /
      grid.angle_step_deg_scaled,
  });
}

module.exports = {
  normalizeAngleGridRulesV1,
  normalizeAngleOnGridV1,
};
