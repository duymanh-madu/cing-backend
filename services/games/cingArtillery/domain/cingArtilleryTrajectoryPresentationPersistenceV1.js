"use strict";

const {
  TRAJECTORY_PRESENTATION_VERSION_V1,
  MAX_TRAJECTORY_PRESENTATION_SAMPLES_V1,
} =
  require(
    "./cingArtilleryTrajectoryPresentationV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_TRAJECTORY_PRESENTATION_PERSISTENCE_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function positiveSafeInteger(
  value,
  field
) {
  if (
    typeof value !==
      "number" ||
    !Number.isSafeInteger(
      value
    ) ||
    value <= 0
  ) {
    throw buildError({
      message:
        `Trajectory presentation persistence Cing Artillery yêu cầu ${field} là positive safe integer`,
    });
  }

  return value;
}


function nonNegativeSafeInteger(
  value,
  field
) {
  if (
    typeof value !==
      "number" ||
    !Number.isSafeInteger(
      value
    ) ||
    value < 0
  ) {
    throw buildError({
      message:
        `Trajectory presentation persistence Cing Artillery yêu cầu ${field} là non-negative safe integer`,
    });
  }

  return value;
}


function canonicalPositiveIntegerText(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||
    !/^[1-9][0-9]*$/u.test(
      value
    )
  ) {
    throw buildError({
      message:
        `Trajectory presentation persistence Cing Artillery có ${field} không canonical`,
    });
  }

  return value;
}


function canonicalSignedIntegerText(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||
    !/^-?(?:0|[1-9][0-9]*)$/u.test(
      value
    ) ||
    value === "-0"
  ) {
    throw buildError({
      message:
        `Trajectory presentation persistence Cing Artillery có ${field} không canonical`,
    });
  }

  return value;
}


function projectTrajectoryPresentationPersistenceV1(
  rawPresentation
) {
  if (
    !rawPresentation ||
    typeof rawPresentation !==
      "object" ||
    Array.isArray(
      rawPresentation
    )
  ) {
    throw buildError({
      message:
        "Trajectory presentation persistence Cing Artillery thiếu presentation",
    });
  }

  if (
    rawPresentation.version !==
      TRAJECTORY_PRESENTATION_VERSION_V1
  ) {
    throw buildError({
      message:
        "Trajectory presentation persistence Cing Artillery có version không hỗ trợ",
      code:
        "CING_ARTILLERY_TRAJECTORY_PRESENTATION_VERSION_UNSUPPORTED_V1",
    });
  }

  const physicsFixedScale =
    canonicalPositiveIntegerText(
      rawPresentation
        .physics_fixed_scale,
      "physics_fixed_scale"
    );

  const sampleStride =
    positiveSafeInteger(
      rawPresentation
        .sample_stride,
      "sample_stride"
    );

  const sampleCount =
    positiveSafeInteger(
      rawPresentation
        .sample_count,
      "sample_count"
    );

  if (
    sampleCount >
      MAX_TRAJECTORY_PRESENTATION_SAMPLES_V1
  ) {
    throw buildError({
      message:
        "Trajectory presentation persistence Cing Artillery vượt sample budget",
      code:
        "CING_ARTILLERY_TRAJECTORY_PRESENTATION_SAMPLE_BUDGET_EXCEEDED_V1",
    });
  }

  if (
    !Array.isArray(
      rawPresentation.samples
    ) ||
    rawPresentation
      .samples.length !==
      sampleCount
  ) {
    throw buildError({
      message:
        "Trajectory presentation persistence Cing Artillery có sample_count mismatch",
      code:
        "CING_ARTILLERY_TRAJECTORY_PRESENTATION_SAMPLE_COUNT_MISMATCH_V1",
    });
  }

  let previousStep =
    null;

  let previousElapsed =
    null;

  const samples =
    rawPresentation.samples.map(
      (
        rawSample,
        index
      ) => {
        if (
          !rawSample ||
          typeof rawSample !==
            "object" ||
          Array.isArray(
            rawSample
          )
        ) {
          throw buildError({
            message:
              `Trajectory presentation persistence Cing Artillery thiếu sample[${index}]`,
          });
        }

        const stepIndex =
          nonNegativeSafeInteger(
            rawSample
              .step_index,
            `samples[${index}].step_index`
          );

        const elapsedMs =
          nonNegativeSafeInteger(
            rawSample
              .elapsed_ms,
            `samples[${index}].elapsed_ms`
          );

        if (
          index === 0 &&
          (
            stepIndex !== 0 ||
            elapsedMs !== 0
          )
        ) {
          throw buildError({
            message:
              "Trajectory presentation persistence Cing Artillery yêu cầu sample đầu tại step/time zero",
            code:
              "CING_ARTILLERY_TRAJECTORY_PRESENTATION_ORIGIN_SAMPLE_INVALID_V1",
          });
        }

        if (
          previousStep !== null &&
          (
            stepIndex <=
              previousStep ||
            elapsedMs <=
              previousElapsed
          )
        ) {
          throw buildError({
            message:
              "Trajectory presentation persistence Cing Artillery yêu cầu sample tăng đơn điệu",
            code:
              "CING_ARTILLERY_TRAJECTORY_PRESENTATION_SAMPLE_ORDER_INVALID_V1",
          });
        }

        previousStep =
          stepIndex;

        previousElapsed =
          elapsedMs;

        return Object.freeze({
          step_index:
            stepIndex,

          elapsed_ms:
            elapsedMs,

          x_scaled:
            canonicalSignedIntegerText(
              rawSample.x_scaled,
              `samples[${index}].x_scaled`
            ),

          y_scaled:
            canonicalSignedIntegerText(
              rawSample.y_scaled,
              `samples[${index}].y_scaled`
            ),
        });
      }
    );

  return Object.freeze({
    version:
      TRAJECTORY_PRESENTATION_VERSION_V1,

    physics_fixed_scale:
      physicsFixedScale,

    sample_stride:
      sampleStride,

    sample_count:
      sampleCount,

    samples:
      Object.freeze(
        samples
      ),
  });
}


module.exports = {
  projectTrajectoryPresentationPersistenceV1,
};
