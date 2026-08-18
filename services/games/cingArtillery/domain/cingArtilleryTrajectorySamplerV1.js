"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * CLOSED-FORM FIXED-STEP TRAJECTORY SAMPLER V1
 *
 * Physics V1 uses constant acceleration during one shot:
 *
 *   ax = immutable initial wind
 *   ay = immutable gravity
 *
 * Therefore every trajectory sample is derived directly
 * from the immutable initial shot state.
 *
 * No sample depends on a previous sample.
 *
 * ----------------------------------------------------
 * TIME
 * ----------------------------------------------------
 *
 *   elapsed_ms =
 *     step_index * physics_step_ms
 *
 * ----------------------------------------------------
 * VELOCITY
 * ----------------------------------------------------
 *
 *   v(t) =
 *     v0 + a * t
 *
 * with milliseconds converted exactly to seconds:
 *
 *   velocity_delta_scaled =
 *     Q(
 *       acceleration_scaled * elapsed_ms
 *       --------------------------------
 *                     1000
 *     )
 *
 * ----------------------------------------------------
 * POSITION
 * ----------------------------------------------------
 *
 *   p(t) =
 *     p0 + v0*t + 1/2*a*t^2
 *
 * represented without floating point:
 *
 *   displacement_scaled =
 *     Q(
 *       2*v0_scaled*elapsed_ms*1000
 *       + acceleration_scaled*elapsed_ms^2
 *       ----------------------------------------
 *                    2*1000^2
 *     )
 *
 * Q is Trajectory Quantization V1:
 *
 *   sign(N) * floor(abs(N) / D)
 *
 * ----------------------------------------------------
 * IMPORTANT
 * ----------------------------------------------------
 *
 * This module does NOT:
 *
 *   integrate from sample N-1
 *   perform collision
 *   inspect terrain
 *   inspect players
 *   enforce map bounds
 *   resolve out-of-bounds
 *   mutate gameplay state
 *   access PostgreSQL
 *   access realtime transport
 *
 * Position is allowed to become negative after launch.
 * World-boundary authority belongs to collision / OOB.
 */

const {
  MAX_TRAJECTORY_STEPS_V1,
} =
  require(
    "./cingArtilleryGameRulesContracts"
  );

const {
  PHYSICS_TIME_UNITS_PER_SECOND_V1,
  normalizePhysicsTimeStepV1,
} =
  require(
    "./cingArtilleryPhysicsSemanticContractV1"
  );

const {
  signedMagnitudeFloorDivV1,
} =
  require(
    "./cingArtilleryTrajectoryQuantizationV1"
  );


const POSITION_DENOMINATOR_V1 =
  2n *
  PHYSICS_TIME_UNITS_PER_SECOND_V1 *
  PHYSICS_TIME_UNITS_PER_SECOND_V1;


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_TRAJECTORY_SAMPLER_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    400;

  return error;
}


function assertBigInt(
  value,
  field
) {
  if (
    typeof value !==
    "bigint"
  ) {
    throw buildError({
      message:
        `Trajectory sampler Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function assertNonNegativeSafeInteger(
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
        `Trajectory sampler Cing Artillery không hợp lệ: ${field}`,
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
        `Trajectory sampler Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function normalizeTrajectoryHorizonV1({
  physicsStepMs,
  maxFlightTimeMs,
}) {
  const stepMs =
    assertPositiveSafeInteger(
      physicsStepMs,
      "physics_step_ms"
    );

  const flightMs =
    assertPositiveSafeInteger(
      maxFlightTimeMs,
      "max_flight_time_ms"
    );

  if (
    flightMs <=
      stepMs ||
    (
      flightMs %
      stepMs
    ) !== 0
  ) {
    throw buildError({
      message:
        "Trajectory sampler Cing Artillery có fixed-step horizon không hợp lệ",
      code:
        "CING_ARTILLERY_TRAJECTORY_HORIZON_INVALID",
    });
  }

  const maxStepIndex =
    flightMs /
    stepMs;

  if (
    maxStepIndex >
      MAX_TRAJECTORY_STEPS_V1
  ) {
    throw buildError({
      message:
        "Trajectory sampler Cing Artillery vượt computational step budget",
      code:
        "CING_ARTILLERY_TRAJECTORY_STEP_BUDGET_EXCEEDED",
    });
  }

  return Object.freeze({
    physics_step_ms:
      stepMs,

    max_flight_time_ms:
      flightMs,

    max_step_index:
      maxStepIndex,
  });
}


function sampleTrajectoryV1({
  physicsVersion,
  physicsStepMs,
  maxFlightTimeMs,
  stepIndex,

  originXScaled,
  originYScaled,

  initialVxScaled,
  initialVyScaled,

  axScaled,
  ayScaled,
}) {
  /*
   * Reuse Physics Semantic V1 as the canonical authority
   * for physics_version and timestep validity.
   */
  const timeStep =
    normalizePhysicsTimeStepV1({
      physicsVersion,
      physicsStepMs,
    });

  const horizon =
    normalizeTrajectoryHorizonV1({
      physicsStepMs:
        timeStep.physics_step_ms,

      maxFlightTimeMs,
    });

  const index =
    assertNonNegativeSafeInteger(
      stepIndex,
      "step_index"
    );

  if (
    index >
      horizon.max_step_index
  ) {
    throw buildError({
      message:
        "Trajectory sampler Cing Artillery có step_index ngoài flight horizon",
      code:
        "CING_ARTILLERY_TRAJECTORY_STEP_OUT_OF_RANGE",
    });
  }


  const x0 =
    assertBigInt(
      originXScaled,
      "origin_x_scaled"
    );

  const y0 =
    assertBigInt(
      originYScaled,
      "origin_y_scaled"
    );

  const vx0 =
    assertBigInt(
      initialVxScaled,
      "initial_vx_scaled"
    );

  const vy0 =
    assertBigInt(
      initialVyScaled,
      "initial_vy_scaled"
    );

  const ax =
    assertBigInt(
      axScaled,
      "ax_scaled"
    );

  const ay =
    assertBigInt(
      ayScaled,
      "ay_scaled"
    );


  const elapsedMs =
    index *
    horizon.physics_step_ms;

  const elapsedMsBigInt =
    BigInt(
      elapsedMs
    );


  /*
   * Velocity at absolute time t.
   *
   * This is NOT:
   *
   *   previous_velocity + per-step acceleration
   *
   * It is always:
   *
   *   initial_velocity + acceleration * absolute_time
   */
  const vxDelta =
    signedMagnitudeFloorDivV1(
      ax *
        elapsedMsBigInt,

      PHYSICS_TIME_UNITS_PER_SECOND_V1
    );

  const vyDelta =
    signedMagnitudeFloorDivV1(
      ay *
        elapsedMsBigInt,

      PHYSICS_TIME_UNITS_PER_SECOND_V1
    );


  const vx =
    vx0 +
    vxDelta;

  const vy =
    vy0 +
    vyDelta;


  /*
   * Closed-form displacement at absolute time t.
   */
  const elapsedMsSquared =
    elapsedMsBigInt *
    elapsedMsBigInt;

  const xDisplacementNumerator =
    (
      2n *
      vx0 *
      elapsedMsBigInt *
      PHYSICS_TIME_UNITS_PER_SECOND_V1
    ) +
    (
      ax *
      elapsedMsSquared
    );

  const yDisplacementNumerator =
    (
      2n *
      vy0 *
      elapsedMsBigInt *
      PHYSICS_TIME_UNITS_PER_SECOND_V1
    ) +
    (
      ay *
      elapsedMsSquared
    );


  const xDisplacement =
    signedMagnitudeFloorDivV1(
      xDisplacementNumerator,
      POSITION_DENOMINATOR_V1
    );

  const yDisplacement =
    signedMagnitudeFloorDivV1(
      yDisplacementNumerator,
      POSITION_DENOMINATOR_V1
    );


  return Object.freeze({
    step_index:
      index,

    elapsed_ms:
      elapsedMs,

    x_scaled:
      x0 +
      xDisplacement,

    y_scaled:
      y0 +
      yDisplacement,

    vx_scaled:
      vx,

    vy_scaled:
      vy,
  });
}


module.exports = {
  sampleTrajectoryV1,
};
