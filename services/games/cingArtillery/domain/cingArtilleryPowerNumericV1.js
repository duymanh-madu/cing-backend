"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * POWER NUMERIC AUTHORITY V1
 *
 * Physics V1 power values are canonical only when they are
 * exactly representable on physics_fixed_scale.
 *
 * Canonical fields:
 *
 *   power_min
 *   power_max
 *   power_velocity_scale
 *   accepted shot power
 *
 * Invariants:
 *
 *   power_min >= 0
 *   power_max >= power_min
 *   power_velocity_scale > 0
 *
 * No implicit rounding is allowed.
 *
 * There is intentionally NO power-step semantic in V1.
 *
 * Therefore every physics-lattice point inside the
 * configured [power_min, power_max] range is canonical.
 *
 * This module does NOT calculate velocity.
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
    "CING_ARTILLERY_INVALID_POWER_NUMERIC_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    400;

  return error;
}


function normalizePowerRulesV1({
  powerMin,
  powerMax,
  powerVelocityScale,
  physicsFixedScale,
}) {
  const minimum =
    toScaledBigInt(
      powerMin,
      physicsFixedScale,
      "power_min"
    );

  const maximum =
    toScaledBigInt(
      powerMax,
      physicsFixedScale,
      "power_max"
    );

  const velocityScale =
    toScaledBigInt(
      powerVelocityScale,
      physicsFixedScale,
      "power_velocity_scale"
    );


  if (minimum < 0n) {
    throw buildError({
      message:
        "Power Cing Artillery yêu cầu power_min >= 0",
    });
  }


  if (maximum < minimum) {
    throw buildError({
      message:
        "Power Cing Artillery có range không hợp lệ",
    });
  }


  if (velocityScale <= 0n) {
    throw buildError({
      message:
        "Power Cing Artillery yêu cầu power_velocity_scale > 0",
    });
  }


  return Object.freeze({
    power_min_scaled:
      minimum,

    power_max_scaled:
      maximum,

    power_velocity_scale_scaled:
      velocityScale,
  });
}


function normalizeShotPowerV1({
  power,
  powerMin,
  powerMax,
  powerVelocityScale,
  physicsFixedScale,
}) {
  const rules =
    normalizePowerRulesV1({
      powerMin,
      powerMax,
      powerVelocityScale,
      physicsFixedScale,
    });


  const shotPower =
    toScaledBigInt(
      power,
      physicsFixedScale,
      "power"
    );


  if (
    shotPower <
      rules.power_min_scaled ||
    shotPower >
      rules.power_max_scaled
  ) {
    throw buildError({
      message:
        "Shot power Cing Artillery nằm ngoài canonical range",
      code:
        "CING_ARTILLERY_SHOT_POWER_OUT_OF_RANGE",
    });
  }


  return Object.freeze({
    power_scaled:
      shotPower,

    power_min_scaled:
      rules.power_min_scaled,

    power_max_scaled:
      rules.power_max_scaled,

    power_velocity_scale_scaled:
      rules.power_velocity_scale_scaled,
  });
}


module.exports = {
  normalizePowerRulesV1,
  normalizeShotPowerV1,
};
