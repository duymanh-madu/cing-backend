"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * TRAJECTORY QUANTIZATION V1
 *
 * Deterministic signed quantization for ballistic physics.
 *
 * This module intentionally does NOT use mathematical floor
 * on an already-signed rational because that would make:
 *
 *   +q  -> q
 *   -q  -> -(q + 1)
 *
 * for non-integral magnitudes.
 *
 * Physics V1 requires mirror symmetry:
 *
 *   quantize(+N / D)
 *     =
 *   -quantize(-N / D)
 *
 * Therefore:
 *
 *   sign(N) * floor(abs(N) / D)
 *
 * Denominator is always strictly positive.
 *
 * This is trajectory physics quantization only.
 * It does NOT redefine damage_rounding.
 */


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_TRAJECTORY_QUANTIZATION_V1",
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
        `Trajectory quantization Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function signedMagnitudeFloorDivV1(
  numerator,
  denominator
) {
  const n =
    assertBigInt(
      numerator,
      "numerator"
    );

  const d =
    assertBigInt(
      denominator,
      "denominator"
    );

  if (d <= 0n) {
    throw buildError({
      message:
        "Trajectory quantization Cing Artillery yêu cầu denominator > 0",
    });
  }

  if (n === 0n) {
    return 0n;
  }

  const negative =
    n < 0n;

  const magnitude =
    negative
      ? -n
      : n;

  const quantizedMagnitude =
    magnitude /
    d;

  return negative
    ? -quantizedMagnitude
    : quantizedMagnitude;
}


module.exports = {
  signedMagnitudeFloorDivV1,
};
