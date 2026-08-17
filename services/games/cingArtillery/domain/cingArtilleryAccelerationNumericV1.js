"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * ACCELERATION NUMERIC AUTHORITY V1
 *
 * Scope:
 *
 *   gravity
 *   wind_min
 *   wind_max
 *   persisted initial_wind
 *
 * Numeric authority only.
 *
 * Every value must be exactly representable on
 * physics_fixed_scale.
 *
 * This module intentionally does NOT define:
 *
 *   physical units
 *   acceleration X/Y mapping
 *   wind direction semantics
 *   timestep integration
 *   trajectory
 *   collision
 *
 * Those semantics require a separate explicit contract.
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
    "CING_ARTILLERY_INVALID_ACCELERATION_NUMERIC_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    400;

  return error;
}


function normalizeAccelerationRulesV1({
  gravity,
  windMin,
  windMax,
  physicsFixedScale,
}) {
  const gravityScaled =
    toScaledBigInt(
      gravity,
      physicsFixedScale,
      "gravity"
    );

  const windMinScaled =
    toScaledBigInt(
      windMin,
      physicsFixedScale,
      "wind_min"
    );

  const windMaxScaled =
    toScaledBigInt(
      windMax,
      physicsFixedScale,
      "wind_max"
    );


  if (gravityScaled <= 0n) {
    throw buildError({
      message:
        "Acceleration numeric Cing Artillery yêu cầu gravity > 0",
    });
  }


  if (
    windMinScaled >
    windMaxScaled
  ) {
    throw buildError({
      message:
        "Acceleration numeric Cing Artillery có wind_min > wind_max",
    });
  }


  return Object.freeze({
    gravity_scaled:
      gravityScaled,

    wind_min_scaled:
      windMinScaled,

    wind_max_scaled:
      windMaxScaled,
  });
}


function normalizePersistedWindV1({
  initialWind,
  windMin,
  windMax,
  physicsFixedScale,
}) {
  const rules =
    normalizeAccelerationRulesV1({
      gravity:
        1,

      windMin,
      windMax,

      physicsFixedScale,
    });


  const initialWindScaled =
    toScaledBigInt(
      initialWind,
      physicsFixedScale,
      "initial_wind"
    );


  if (
    initialWindScaled <
      rules.wind_min_scaled ||
    initialWindScaled >
      rules.wind_max_scaled
  ) {
    throw buildError({
      message:
        "Acceleration numeric Cing Artillery có initial_wind ngoài canonical range",
      code:
        "CING_ARTILLERY_INITIAL_WIND_OUT_OF_RANGE",
    });
  }


  return Object.freeze({
    initial_wind_scaled:
      initialWindScaled,

    wind_min_scaled:
      rules.wind_min_scaled,

    wind_max_scaled:
      rules.wind_max_scaled,
  });
}


module.exports = {
  normalizeAccelerationRulesV1,
  normalizePersistedWindV1,
};
