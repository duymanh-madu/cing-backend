"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  projectTrajectoryPresentationPersistenceV1,
} =
  require(
    "../domain/cingArtilleryTrajectoryPresentationPersistenceV1"
  );


function validPresentation() {
  return {
    version:
      1,

    physics_fixed_scale:
      "1000000",

    sample_stride:
      4,

    sample_count:
      3,

    samples: [
      {
        step_index:
          0,

        elapsed_ms:
          0,

        x_scaled:
          "123000000",

        y_scaled:
          "-456000000",
      },
      {
        step_index:
          4,

        elapsed_ms:
          80,

        x_scaled:
          "130000000",

        y_scaled:
          "-470000000",
      },
      {
        step_index:
          7,

        elapsed_ms:
          140,

        x_scaled:
          "138000000",

        y_scaled:
          "-480000000",
      },
    ],
  };
}


test(
  "trajectory persistence projection preserves exact decimal coordinates",
  () => {
    const result =
      projectTrajectoryPresentationPersistenceV1(
        validPresentation()
      );

    assert.equal(
      result.version,
      1
    );

    assert.equal(
      result.physics_fixed_scale,
      "1000000"
    );

    assert.equal(
      result.sample_count,
      3
    );

    assert.equal(
      result.samples[0]
        .x_scaled,
      "123000000"
    );

    assert.equal(
      result.samples[0]
        .y_scaled,
      "-456000000"
    );

    assert.doesNotThrow(
      () =>
        JSON.stringify(
          result
        )
    );
  }
);


test(
  "trajectory persistence projection rejects sample count mismatch",
  () => {
    const value =
      validPresentation();

    value.sample_count =
      2;

    assert.throws(
      () =>
        projectTrajectoryPresentationPersistenceV1(
          value
        ),
      {
        code:
          "CING_ARTILLERY_TRAJECTORY_PRESENTATION_SAMPLE_COUNT_MISMATCH_V1",
      }
    );
  }
);


test(
  "trajectory persistence projection rejects non-monotonic samples",
  () => {
    const value =
      validPresentation();

    value.samples[2]
      .step_index =
      4;

    assert.throws(
      () =>
        projectTrajectoryPresentationPersistenceV1(
          value
        ),
      {
        code:
          "CING_ARTILLERY_TRAJECTORY_PRESENTATION_SAMPLE_ORDER_INVALID_V1",
      }
    );
  }
);


test(
  "trajectory persistence projection rejects noncanonical integer text",
  () => {
    const value =
      validPresentation();

    value.samples[1]
      .x_scaled =
      "00123";

    assert.throws(
      () =>
        projectTrajectoryPresentationPersistenceV1(
          value
        ),
      {
        code:
          "CING_ARTILLERY_INVALID_TRAJECTORY_PRESENTATION_PERSISTENCE_V1",
      }
    );
  }
);


test(
  "processor projects server trajectory for durable persistence boundary",
  () => {
    const processorSource =
      fs.readFileSync(
        path.join(
          __dirname,
          "../services/cingArtilleryShotExecutionProcessorV1.js"
        ),
        "utf8"
      );

    assert.match(
      processorSource,
      /projectTrajectoryPresentationPersistenceV1/u
    );

    assert.match(
      processorSource,
      /trajectory\s*\.\s*trajectory_presentation/u
    );

    assert.match(
      processorSource,
      /trajectory_presentation:\s*trajectoryPresentation/u
    );

    assert.match(
      processorSource,
      /trajectory_presentation:\s*computation\s*\.trajectory_presentation/u
    );
  }
);
