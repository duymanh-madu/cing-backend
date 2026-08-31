"use strict";

const assert =
  require("node:assert/strict");

const test =
  require("node:test");

const {
  MAX_TRAJECTORY_PRESENTATION_SAMPLES_V1,
  createTrajectoryPresentationCollectorV1,
} =
  require(
    "../domain/cingArtilleryTrajectoryPresentationV1"
  );


function sample(
  step
) {
  return {
    step_index:
      step,

    elapsed_ms:
      step * 20,

    x_scaled:
      BigInt(
        step * 1000
      ),

    y_scaled:
      BigInt(
        step * -500
      ),
  };
}


test(
  "short trajectory preserves every canonical sample",
  () => {
    const collector =
      createTrajectoryPresentationCollectorV1({
        maxStepIndex:
          10,

        physicsFixedScale:
          1000,
      });

    for (
      let step = 0;
      step <= 10;
      step += 1
    ) {
      collector.capture(
        sample(step)
      );
    }

    const result =
      collector.finalize(
        sample(10)
      );

    assert.equal(
      result.version,
      1
    );

    assert.equal(
      result.sample_stride,
      1
    );

    assert.equal(
      result.sample_count,
      11
    );

    assert.equal(
      result.samples[0]
        .step_index,
      0
    );

    assert.equal(
      result.samples[10]
        .step_index,
      10
    );
  }
);


test(
  "large trajectory is deterministically bounded",
  () => {
    const maxStepIndex =
      15000;

    const collector =
      createTrajectoryPresentationCollectorV1({
        maxStepIndex,

        physicsFixedScale:
          1000,
      });

    for (
      let step = 0;
      step <= maxStepIndex;
      step += 1
    ) {
      collector.capture(
        sample(step)
      );
    }

    const result =
      collector.finalize(
        sample(
          maxStepIndex
        )
      );

    assert.ok(
      result.sample_count <=
        MAX_TRAJECTORY_PRESENTATION_SAMPLES_V1
    );

    assert.equal(
      result.samples[0]
        .step_index,
      0
    );

    assert.equal(
      result.samples[
        result.samples.length - 1
      ].step_index,
      maxStepIndex
    );

    assert.ok(
      result.sample_stride > 1
    );
  }
);


test(
  "terminal sample is retained when it is between stride boundaries",
  () => {
    const collector =
      createTrajectoryPresentationCollectorV1({
        maxStepIndex:
          15000,

        physicsFixedScale:
          1000,
      });

    for (
      let step = 0;
      step <= 137;
      step += 1
    ) {
      collector.capture(
        sample(step)
      );
    }

    const result =
      collector.finalize(
        sample(137)
      );

    assert.equal(
      result.samples[
        result.samples.length - 1
      ].step_index,
      137
    );
  }
);


test(
  "scaled coordinates cross persistence boundary as exact decimal text",
  () => {
    const collector =
      createTrajectoryPresentationCollectorV1({
        maxStepIndex:
          10,

        physicsFixedScale:
          1000,
      });

    collector.capture({
      step_index:
        0,

      elapsed_ms:
        0,

      x_scaled:
        9007199254740993000n,

      y_scaled:
        -9007199254740993000n,
    });

    const result =
      collector.finalize({
        step_index:
          1,

      elapsed_ms:
        20,

      x_scaled:
        9007199254740994000n,

      y_scaled:
        -9007199254740994000n,
    });

    assert.equal(
      result.samples[0]
        .x_scaled,
      "9007199254740993000"
    );

    assert.equal(
      result.samples[1]
        .y_scaled,
      "-9007199254740994000"
    );
  }
);


test(
  "collector rejects non-monotonic canonical samples",
  () => {
    const collector =
      createTrajectoryPresentationCollectorV1({
        maxStepIndex:
          10,

        physicsFixedScale:
          1000,
      });

    collector.capture(
      sample(0)
    );

    collector.capture(
      sample(1)
    );

    assert.throws(
      () =>
        collector.capture(
          sample(1)
        ),
      {
        code:
          "CING_ARTILLERY_TRAJECTORY_PRESENTATION_SAMPLE_ORDER_INVALID_V1",
      }
    );
  }
);


test(
  "solver captures presentation after collision classification rather than beyond exact impact",
  () => {
    const fs =
      require("node:fs");

    const path =
      require("node:path");

    const solverSource =
      fs.readFileSync(
        path.join(
          __dirname,
          "../domain/cingArtilleryShotTrajectorySolverV1.js"
        ),
        "utf8"
      );

    const classifierIndex =
      solverSource.indexOf(
        "classifyShotSegmentEventV1({"
      );

    const nonTerminalCaptureIndex =
      solverSource.indexOf(
        "presentationCollector.capture(\n      currentSample"
      );

    assert.ok(
      classifierIndex >= 0
    );

    assert.ok(
      nonTerminalCaptureIndex >
        classifierIndex
    );

    const collisionReturnStart =
      solverSource.indexOf(
        "numeric_impact:\n          numericImpact"
      );

    const collisionPresentation =
      solverSource.slice(
        collisionReturnStart,
        collisionReturnStart + 500
      );

    assert.match(
      collisionPresentation,
      /\.finalize\(\s*previousSample\s*\)/u
    );

    assert.doesNotMatch(
      collisionPresentation,
      /\.finalize\(\s*currentSample\s*\)/u
    );
  }
);


test(
  "solver retains terminal current sample for out-of-bounds presentation",
  () => {
    const fs =
      require("node:fs");

    const path =
      require("node:path");

    const solverSource =
      fs.readFileSync(
        path.join(
          __dirname,
          "../domain/cingArtilleryShotTrajectorySolverV1.js"
        ),
        "utf8"
      );

    const oobStart =
      solverSource.indexOf(
        "SHOT_TRAJECTORY_SOLVER_OUTCOME_V1.OUT_OF_BOUNDS"
      );

    const oobBlock =
      solverSource.slice(
        oobStart,
        oobStart + 900
      );

    assert.match(
      oobBlock,
      /trajectory_presentation/u
    );

    assert.match(
      oobBlock,
      /\.finalize\(\s*currentSample\s*\)/u
    );
  }
);


test(
  "solver exposes bounded presentation without replacing canonical terminal segment",
  () => {
    const fs =
      require("node:fs");

    const path =
      require("node:path");

    const solverSource =
      fs.readFileSync(
        path.join(
          __dirname,
          "../domain/cingArtilleryShotTrajectorySolverV1.js"
        ),
        "utf8"
      );

    assert.match(
      solverSource,
      /trajectory_segment:\s*trajectorySegment/u
    );

    assert.match(
      solverSource,
      /trajectory_presentation:/u
    );

    assert.match(
      solverSource,
      /createTrajectoryPresentationCollectorV1/u
    );
  }
);


test(
  "presentation carries exact fixed-point scale independently of impact contract",
  () => {
    const collector =
      createTrajectoryPresentationCollectorV1({
        maxStepIndex:
          10,

        physicsFixedScale:
          1000000,
      });

    collector.capture(
      sample(0)
    );

    const result =
      collector.finalize(
        sample(1)
      );

    assert.equal(
      result.physics_fixed_scale,
      "1000000"
    );
  }
);


test(
  "collector rejects missing or invalid presentation fixed-point scale",
  () => {
    assert.throws(
      () =>
        createTrajectoryPresentationCollectorV1({
          maxStepIndex:
            10,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_TRAJECTORY_PRESENTATION_V1",
      }
    );

    assert.throws(
      () =>
        createTrajectoryPresentationCollectorV1({
          maxStepIndex:
            10,

          physicsFixedScale:
            0,
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_TRAJECTORY_PRESENTATION_V1",
      }
    );
  }
);
