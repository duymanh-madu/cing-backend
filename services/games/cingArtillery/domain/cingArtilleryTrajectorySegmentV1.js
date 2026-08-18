"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * TRAJECTORY SEGMENT CONTRACT V1
 *
 * A segment represents exactly one canonical fixed-step
 * motion interval:
 *
 *   sample(step N - 1)
 *          ->
 *   sample(step N)
 *
 * It owns motion representation only.
 *
 * All coordinates remain on the canonical scaled
 * physics lattice as BigInt.
 *
 * It intentionally does NOT:
 *
 *   convert scaled coordinates to integer map pixels
 *   inspect terrain
 *   inspect collision masks
 *   apply projectile radius
 *   inspect player colliders
 *   classify out-of-bounds
 *   resolve impact precedence
 *   access PostgreSQL
 *   access realtime transport
 *
 * Negative coordinates are valid here because OOB is
 * a later collision/world-boundary authority.
 */


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_TRAJECTORY_SEGMENT_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    400;

  return error;
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
        `Trajectory segment Cing Artillery không hợp lệ: ${field}`,
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
        `Trajectory segment Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
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
        `Trajectory segment Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function normalizeTrajectorySampleV1(
  sample,
  fieldPrefix
) {
  if (
    !sample ||
    typeof sample !== "object" ||
    Array.isArray(sample)
  ) {
    throw buildError({
      message:
        `Trajectory segment Cing Artillery thiếu canonical sample: ${fieldPrefix}`,
    });
  }

  return Object.freeze({
    step_index:
      assertNonNegativeSafeInteger(
        sample.step_index,
        `${fieldPrefix}.step_index`
      ),

    elapsed_ms:
      assertNonNegativeSafeInteger(
        sample.elapsed_ms,
        `${fieldPrefix}.elapsed_ms`
      ),

    x_scaled:
      assertBigInt(
        sample.x_scaled,
        `${fieldPrefix}.x_scaled`
      ),

    y_scaled:
      assertBigInt(
        sample.y_scaled,
        `${fieldPrefix}.y_scaled`
      ),
  });
}


function buildTrajectorySegmentV1({
  physicsStepMs,
  fromSample,
  toSample,
}) {
  const stepMs =
    assertPositiveSafeInteger(
      physicsStepMs,
      "physics_step_ms"
    );

  const from =
    normalizeTrajectorySampleV1(
      fromSample,
      "from_sample"
    );

  const to =
    normalizeTrajectorySampleV1(
      toSample,
      "to_sample"
    );


  if (
    to.step_index !==
      from.step_index + 1
  ) {
    throw buildError({
      message:
        "Trajectory segment Cing Artillery yêu cầu hai sample liên tiếp",
      code:
        "CING_ARTILLERY_TRAJECTORY_SEGMENT_NON_ADJACENT_STEPS",
    });
  }


  const durationMs =
    to.elapsed_ms -
    from.elapsed_ms;

  if (
    durationMs !==
    stepMs
  ) {
    throw buildError({
      message:
        "Trajectory segment Cing Artillery có fixed-step duration không nhất quán",
      code:
        "CING_ARTILLERY_TRAJECTORY_SEGMENT_TIME_MISMATCH",
    });
  }


  const deltaX =
    to.x_scaled -
    from.x_scaled;

  const deltaY =
    to.y_scaled -
    from.y_scaled;


  return Object.freeze({
    from_step_index:
      from.step_index,

    to_step_index:
      to.step_index,

    from_elapsed_ms:
      from.elapsed_ms,

    to_elapsed_ms:
      to.elapsed_ms,

    duration_ms:
      durationMs,

    start_x_scaled:
      from.x_scaled,

    start_y_scaled:
      from.y_scaled,

    end_x_scaled:
      to.x_scaled,

    end_y_scaled:
      to.y_scaled,

    delta_x_scaled:
      deltaX,

    delta_y_scaled:
      deltaY,
  });
}


module.exports = {
  buildTrajectorySegmentV1,
};
