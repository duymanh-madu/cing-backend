"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * DETERMINISTIC TRIG ALGORITHM V1 CONTRACT
 *
 * This file defines algorithm identity only.
 *
 * It intentionally does NOT contain:
 *
 *   atan constants
 *   gain compensation constants
 *   CORDIC rotation
 *   sin/cos implementation
 *   trajectory logic
 *
 * Algorithm V1 owns its iteration count and canonical
 * integer representation. These are NOT gameplay tuning.
 */

const TRIG_ALGORITHM_VERSION_V1 =
  1;

const CORDIC_ITERATIONS_V1 =
  32;

/*
 * V1 canonical angular lattice:
 *
 *   1 degree = 1,000,000,000 integer units
 *
 * Therefore:
 *
 *   90 degrees  = 90,000,000,000
 *   180 degrees = 180,000,000,000
 *   360 degrees = 360,000,000,000
 */
const TRIG_ANGLE_SCALE_V1 =
  1000000000;

const TRIG_VALUE_SCALE_V1 =
  1000000000;


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_TRIG_ALGORITHM_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function assertTrigAlgorithmV1Contract({
  trigAlgorithmVersion,
  trigAngleScale,
  trigValueScale,
}) {
  if (
    trigAlgorithmVersion !==
      TRIG_ALGORITHM_VERSION_V1 ||
    trigAngleScale !==
      TRIG_ANGLE_SCALE_V1 ||
    trigValueScale !==
      TRIG_VALUE_SCALE_V1
  ) {
    throw buildError({
      message:
        "Trig algorithm Cing Artillery V1 có representation không hợp lệ",
    });
  }

  return Object.freeze({
    trig_algorithm_version:
      TRIG_ALGORITHM_VERSION_V1,

    cordic_iterations:
      CORDIC_ITERATIONS_V1,

    trig_angle_scale:
      TRIG_ANGLE_SCALE_V1,

    trig_value_scale:
      TRIG_VALUE_SCALE_V1,
  });
}


module.exports = {
  TRIG_ALGORITHM_VERSION_V1,
  CORDIC_ITERATIONS_V1,

  TRIG_ANGLE_SCALE_V1,
  TRIG_VALUE_SCALE_V1,

  assertTrigAlgorithmV1Contract,
};
