"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * PHYSICS SEMANTIC CONTRACT V1
 *
 * This module locks the physical meaning of
 * physics_version = 1.
 *
 * It does NOT integrate trajectory.
 * It does NOT perform collision.
 * It does NOT mutate gameplay state.
 *
 * ----------------------------------------------------
 * WORLD COORDINATES
 * ----------------------------------------------------
 *
 *   +X = right
 *   +Y = down
 *
 * ----------------------------------------------------
 * CANONICAL PHYSICAL UNITS
 * ----------------------------------------------------
 *
 *   position      = pixel
 *   time          = second
 *   velocity      = pixel / second
 *   acceleration  = pixel / second^2
 *
 * Rules continue storing:
 *
 *   physics_step_ms
 *
 * as integer milliseconds. Therefore:
 *
 *   dt_seconds =
 *     physics_step_ms / 1000
 *
 * ----------------------------------------------------
 * ACCELERATION MAPPING
 * ----------------------------------------------------
 *
 *   ax = initial_wind
 *   ay = gravity
 *
 * Positive wind accelerates toward world +X (right).
 * Negative wind accelerates toward world -X (left).
 *
 * gravity must be positive and therefore accelerates
 * toward world +Y (down).
 *
 * Wind is WORLD-relative.
 *
 * Wind is NOT:
 *   shooter-relative
 *   side-relative
 *   angle-relative
 *
 * ----------------------------------------------------
 * VELOCITY SEMANTICS
 * ----------------------------------------------------
 *
 * Initial-velocity values are physical velocity:
 *
 *   vx = pixel / second
 *   vy = pixel / second
 *
 * power_velocity_scale therefore means:
 *
 *   pixel / second per power unit
 *
 * ----------------------------------------------------
 * FIXED-POINT REPRESENTATION
 * ----------------------------------------------------
 *
 * Physical position, velocity and acceleration values
 * use physics_fixed_scale.
 *
 * This contract intentionally does not choose an
 * integration equation or update order. Those belong
 * to the Fixed-Step Trajectory Integrator contract.
 */


const PHYSICS_SEMANTIC_VERSION_V1 =
  1;

const PHYSICS_TIME_UNITS_PER_SECOND_V1 =
  1000n;

const WORLD_X_RIGHT_SIGN_V1 =
  1n;

const WORLD_Y_DOWN_SIGN_V1 =
  1n;


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_PHYSICS_SEMANTIC_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    400;

  return error;
}


function assertPositiveSafeInteger(
  value,
  field
) {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw buildError({
      message:
        `Physics semantic Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function assertBigInt(
  value,
  field
) {
  if (typeof value !== "bigint") {
    throw buildError({
      message:
        `Physics semantic Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function assertPhysicsVersionV1(
  physicsVersion
) {
  if (
    physicsVersion !==
    PHYSICS_SEMANTIC_VERSION_V1
  ) {
    throw buildError({
      message:
        "Physics semantic Cing Artillery yêu cầu physics_version = 1",
      code:
        "CING_ARTILLERY_UNSUPPORTED_PHYSICS_VERSION",
    });
  }

  return physicsVersion;
}


function normalizePhysicsTimeStepV1({
  physicsVersion,
  physicsStepMs,
}) {
  assertPhysicsVersionV1(
    physicsVersion
  );

  const stepMs =
    assertPositiveSafeInteger(
      physicsStepMs,
      "physics_step_ms"
    );

  return Object.freeze({
    physics_version:
      PHYSICS_SEMANTIC_VERSION_V1,

    physics_step_ms:
      stepMs,

    dt_seconds_numerator:
      BigInt(stepMs),

    dt_seconds_denominator:
      PHYSICS_TIME_UNITS_PER_SECOND_V1,
  });
}


function mapWorldAccelerationV1({
  physicsVersion,
  gravityScaled,
  initialWindScaled,
}) {
  assertPhysicsVersionV1(
    physicsVersion
  );

  const gravity =
    assertBigInt(
      gravityScaled,
      "gravity_scaled"
    );

  const wind =
    assertBigInt(
      initialWindScaled,
      "initial_wind_scaled"
    );

  if (gravity <= 0n) {
    throw buildError({
      message:
        "Physics semantic Cing Artillery yêu cầu gravity_scaled > 0",
    });
  }

  return Object.freeze({
    physics_version:
      PHYSICS_SEMANTIC_VERSION_V1,

    ax_scaled:
      wind,

    ay_scaled:
      gravity,
  });
}


function getPhysicsSemanticContractV1() {
  return Object.freeze({
    physics_version:
      PHYSICS_SEMANTIC_VERSION_V1,

    world_x_positive:
      "right",

    world_y_positive:
      "down",

    position_unit:
      "pixel",

    time_unit:
      "second",

    velocity_unit:
      "pixel_per_second",

    acceleration_unit:
      "pixel_per_second_squared",

    physics_step_storage_unit:
      "millisecond",

    power_velocity_scale_unit:
      "pixel_per_second_per_power_unit",

    wind_reference_frame:
      "world_x",

    positive_wind_direction:
      "right",

    negative_wind_direction:
      "left",

    gravity_direction:
      "down",

    world_x_right_sign:
      WORLD_X_RIGHT_SIGN_V1,

    world_y_down_sign:
      WORLD_Y_DOWN_SIGN_V1,

    milliseconds_per_second:
      PHYSICS_TIME_UNITS_PER_SECOND_V1,
  });
}


module.exports = {
  PHYSICS_SEMANTIC_VERSION_V1,
  PHYSICS_TIME_UNITS_PER_SECOND_V1,
  WORLD_X_RIGHT_SIGN_V1,
  WORLD_Y_DOWN_SIGN_V1,

  assertPhysicsVersionV1,
  normalizePhysicsTimeStepV1,
  mapWorldAccelerationV1,
  getPhysicsSemanticContractV1,
};
