"use strict";

const TRAJECTORY_PRESENTATION_VERSION_V1 =
  1;

const MAX_TRAJECTORY_PRESENTATION_SAMPLES_V1 =
  256;


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_TRAJECTORY_PRESENTATION_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    400;

  return error;
}


function normalizeSample(
  sample,
  field
) {
  if (
    !sample ||
    typeof sample !==
      "object" ||
    Array.isArray(sample)
  ) {
    throw buildError({
      message:
        `Trajectory presentation Cing Artillery thiếu sample: ${field}`,
    });
  }

  if (
    !Number.isSafeInteger(
      sample.step_index
    ) ||
    sample.step_index < 0 ||
    !Number.isSafeInteger(
      sample.elapsed_ms
    ) ||
    sample.elapsed_ms < 0 ||
    typeof sample.x_scaled !==
      "bigint" ||
    typeof sample.y_scaled !==
      "bigint"
  ) {
    throw buildError({
      message:
        `Trajectory presentation Cing Artillery có sample không hợp lệ: ${field}`,
    });
  }

  return Object.freeze({
    step_index:
      sample.step_index,

    elapsed_ms:
      sample.elapsed_ms,

    x_scaled:
      sample.x_scaled,

    y_scaled:
      sample.y_scaled,
  });
}


function createTrajectoryPresentationCollectorV1({
  maxStepIndex,
  physicsFixedScale,
}) {
  if (
    !Number.isSafeInteger(
      maxStepIndex
    ) ||
    maxStepIndex <= 0
  ) {
    throw buildError({
      message:
        "Trajectory presentation Cing Artillery có max_step_index không hợp lệ",
    });
  }

  if (
    !Number.isSafeInteger(
      physicsFixedScale
    ) ||
    physicsFixedScale <= 0
  ) {
    throw buildError({
      message:
        "Trajectory presentation Cing Artillery có physics_fixed_scale không hợp lệ",
    });
  }

  const stride =
    Math.max(
      1,
      Math.ceil(
        maxStepIndex /
          (
            MAX_TRAJECTORY_PRESENTATION_SAMPLES_V1 -
            1
          )
      )
    );

  const samples =
    [];

  let lastSample =
    null;


  function capture(
    rawSample
  ) {
    const sample =
      normalizeSample(
        rawSample,
        "sample"
      );

    if (
      lastSample &&
      sample.step_index <=
        lastSample.step_index
    ) {
      throw buildError({
        message:
          "Trajectory presentation Cing Artillery yêu cầu sample tăng đơn điệu",
        code:
          "CING_ARTILLERY_TRAJECTORY_PRESENTATION_SAMPLE_ORDER_INVALID_V1",
      });
    }

    lastSample =
      sample;

    if (
      sample.step_index === 0 ||
      (
        sample.step_index %
        stride
      ) === 0
    ) {
      samples.push(
        sample
      );
    }
  }


  function finalize(
    rawTerminalSample
  ) {
    const terminalSample =
      normalizeSample(
        rawTerminalSample,
        "terminal_sample"
      );

    if (
      lastSample &&
      terminalSample.step_index <
        lastSample.step_index
    ) {
      throw buildError({
        message:
          "Trajectory presentation Cing Artillery có terminal sample lùi thời gian",
        code:
          "CING_ARTILLERY_TRAJECTORY_PRESENTATION_TERMINAL_ORDER_INVALID_V1",
      });
    }

    const finalSamples =
      samples.slice();

    const existingLast =
      finalSamples[
        finalSamples.length - 1
      ];

    if (
      !existingLast ||
      existingLast.step_index !==
        terminalSample.step_index
    ) {
      finalSamples.push(
        terminalSample
      );
    }

    if (
      finalSamples.length >
      MAX_TRAJECTORY_PRESENTATION_SAMPLES_V1
    ) {
      throw buildError({
        message:
          "Trajectory presentation Cing Artillery vượt sample budget",
        code:
          "CING_ARTILLERY_TRAJECTORY_PRESENTATION_SAMPLE_BUDGET_EXCEEDED_V1",
      });
    }

    return Object.freeze({
      version:
        TRAJECTORY_PRESENTATION_VERSION_V1,

      physics_fixed_scale:
        String(
          physicsFixedScale
        ),

      sample_stride:
        stride,

      sample_count:
        finalSamples.length,

      samples:
        Object.freeze(
          finalSamples.map(
            (
              sample
            ) =>
              Object.freeze({
                step_index:
                  sample.step_index,

                elapsed_ms:
                  sample.elapsed_ms,

                x_scaled:
                  sample.x_scaled
                    .toString(),

                y_scaled:
                  sample.y_scaled
                    .toString(),
              })
          )
        ),
    });
  }


  return Object.freeze({
    capture,
    finalize,
  });
}


module.exports = {
  TRAJECTORY_PRESENTATION_VERSION_V1,
  MAX_TRAJECTORY_PRESENTATION_SAMPLES_V1,
  createTrajectoryPresentationCollectorV1,
};
