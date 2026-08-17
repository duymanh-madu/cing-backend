"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * TRIG REPRESENTATION CONTRACT V1
 *
 * Scope:
 *
 *   canonical angle-grid integer
 *      ->
 *   exact trig-angle integer
 *
 * This module intentionally does NOT implement:
 *
 *   sin
 *   cos
 *   CORDIC
 *   trajectory
 *   velocity
 *
 * Two independent scales exist:
 *
 *   physicsFixedScale
 *     integer units per gameplay numeric unit
 *
 *   trigAngleScale
 *     integer units per degree used by deterministic trig
 *
 *   trigValueScale
 *     integer representation of dimensionless trig output
 *
 * No implicit rounding is allowed when converting an angle
 * from the gameplay lattice to the trig-angle lattice.
 */

function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_TRIG_REPRESENTATION",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
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
        `Trig representation Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
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
        `Trig representation Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function normalizeTrigRepresentationV1({
  physicsFixedScale,
  trigAngleScale,
  trigValueScale,
}) {
  const physicsScale =
    assertPositiveSafeInteger(
      physicsFixedScale,
      "physics_fixed_scale"
    );

  const angleScale =
    assertPositiveSafeInteger(
      trigAngleScale,
      "trig_angle_scale"
    );

  const valueScale =
    assertPositiveSafeInteger(
      trigValueScale,
      "trig_value_scale"
    );

  return Object.freeze({
    physics_fixed_scale:
      physicsScale,

    trig_angle_scale:
      angleScale,

    trig_value_scale:
      valueScale,
  });
}


function convertPhysicsAngleToTrigUnitsV1({
  angleDegScaled,
  physicsFixedScale,
  trigAngleScale,
}) {
  const angle =
    assertBigInt(
      angleDegScaled,
      "angle_deg_scaled"
    );

  const physicsScale =
    BigInt(
      assertPositiveSafeInteger(
        physicsFixedScale,
        "physics_fixed_scale"
      )
    );

  const angleScale =
    BigInt(
      assertPositiveSafeInteger(
        trigAngleScale,
        "trig_angle_scale"
      )
    );

  const numerator =
    angle *
    angleScale;

  /*
   * Exact conversion authority.
   *
   * angleDegScaled / physicsFixedScale
   *
   * is the canonical degree value.
   *
   * The trig representation is:
   *
   * degree value * trigAngleScale
   *
   * Any remainder means the configured trig lattice cannot
   * represent this canonical gameplay angle exactly.
   */
  if (
    numerator %
      physicsScale !==
    0n
  ) {
    throw buildError({
      message:
        "Trig angle Cing Artillery không biểu diễn chính xác canonical angle",
      code:
        "CING_ARTILLERY_TRIG_ANGLE_QUANTIZATION_ERROR",
    });
  }

  return (
    numerator /
    physicsScale
  );
}


function assertAngleGridFitsTrigRepresentationV1({
  angleMinDegScaled,
  angleMaxDegScaled,
  angleStepDegScaled,
  physicsFixedScale,
  trigAngleScale,
}) {
  const minimum =
    assertBigInt(
      angleMinDegScaled,
      "angle_min_deg_scaled"
    );

  const maximum =
    assertBigInt(
      angleMaxDegScaled,
      "angle_max_deg_scaled"
    );

  const step =
    assertBigInt(
      angleStepDegScaled,
      "angle_step_deg_scaled"
    );

  if (
    maximum < minimum ||
    step <= 0n
  ) {
    throw buildError({
      message:
        "Trig representation Cing Artillery nhận angle grid không hợp lệ",
    });
  }

  const minimumTrig =
    convertPhysicsAngleToTrigUnitsV1({
      angleDegScaled:
        minimum,

      physicsFixedScale,
      trigAngleScale,
    });

  const maximumTrig =
    convertPhysicsAngleToTrigUnitsV1({
      angleDegScaled:
        maximum,

      physicsFixedScale,
      trigAngleScale,
    });

  const stepTrig =
    convertPhysicsAngleToTrigUnitsV1({
      angleDegScaled:
        step,

      physicsFixedScale,
      trigAngleScale,
    });

  if (stepTrig <= 0n) {
    throw buildError({
      message:
        "Trig representation Cing Artillery có trig angle step không hợp lệ",
    });
  }

  return Object.freeze({
    angle_min_trig_units:
      minimumTrig,

    angle_max_trig_units:
      maximumTrig,

    angle_step_trig_units:
      stepTrig,
  });
}


module.exports = {
  normalizeTrigRepresentationV1,
  convertPhysicsAngleToTrigUnitsV1,
  assertAngleGridFitsTrigRepresentationV1,
};
