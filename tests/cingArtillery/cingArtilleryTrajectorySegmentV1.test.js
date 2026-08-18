"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  sampleTrajectoryV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryTrajectorySamplerV1"
  );

const {
  buildTrajectorySegmentV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryTrajectorySegmentV1"
  );


function shot(
  stepIndex,
  overrides = {}
) {
  return sampleTrajectoryV1({
    physicsVersion:
      1,

    physicsStepMs:
      10,

    maxFlightTimeMs:
      1000,

    stepIndex,

    originXScaled:
      100000n,

    originYScaled:
      100000n,

    initialVxScaled:
      70710n,

    initialVyScaled:
      -70710n,

    axScaled:
      0n,

    ayScaled:
      980000n,

    ...overrides,
  });
}


test(
  "segment 0 to 1 preserves exact canonical sampler endpoints",
  () => {
    const from =
      shot(0);

    const to =
      shot(1);

    const result =
      buildTrajectorySegmentV1({
        physicsStepMs:
          10,

        fromSample:
          from,

        toSample:
          to,
      });

    assert.deepEqual(
      result,
      {
        from_step_index:
          0,

        to_step_index:
          1,

        from_elapsed_ms:
          0,

        to_elapsed_ms:
          10,

        duration_ms:
          10,

        start_x_scaled:
          100000n,

        start_y_scaled:
          100000n,

        end_x_scaled:
          100707n,

        end_y_scaled:
          99342n,

        delta_x_scaled:
          707n,

        delta_y_scaled:
          -658n,
      }
    );

    assert.ok(
      Object.isFrozen(
        result
      )
    );
  }
);


test(
  "segment delta is always exact endpoint subtraction",
  () => {
    const from =
      shot(
        9,
        {
          axScaled:
            100000n,
        }
      );

    const to =
      shot(
        10,
        {
          axScaled:
            100000n,
        }
      );

    const result =
      buildTrajectorySegmentV1({
        physicsStepMs:
          10,

        fromSample:
          from,

        toSample:
          to,
      });

    assert.equal(
      result.delta_x_scaled,
      result.end_x_scaled -
        result.start_x_scaled
    );

    assert.equal(
      result.delta_y_scaled,
      result.end_y_scaled -
        result.start_y_scaled
    );
  }
);


test(
  "left mirrored shot produces mirrored horizontal segment",
  () => {
    const right =
      buildTrajectorySegmentV1({
        physicsStepMs:
          10,

        fromSample:
          shot(
            9,
            {
              axScaled:
                100000n,
            }
          ),

        toSample:
          shot(
            10,
            {
              axScaled:
                100000n,
            }
          ),
      });

    const left =
      buildTrajectorySegmentV1({
        physicsStepMs:
          10,

        fromSample:
          shot(
            9,
            {
              initialVxScaled:
                -70710n,

              axScaled:
                -100000n,
            }
          ),

        toSample:
          shot(
            10,
            {
              initialVxScaled:
                -70710n,

              axScaled:
                -100000n,
            }
          ),
      });

    assert.equal(
      left.delta_x_scaled,
      -right.delta_x_scaled
    );

    assert.equal(
      left.delta_y_scaled,
      right.delta_y_scaled
    );
  }
);


test(
  "negative coordinates remain valid segment-space coordinates",
  () => {
    const from = {
      step_index:
        4,

      elapsed_ms:
        40,

      x_scaled:
        100n,

      y_scaled:
        -500n,
    };

    const to = {
      step_index:
        5,

      elapsed_ms:
        50,

      x_scaled:
        -900n,

      y_scaled:
        -300n,
    };

    const result =
      buildTrajectorySegmentV1({
        physicsStepMs:
          10,

        fromSample:
          from,

        toSample:
          to,
      });

    assert.equal(
      result.start_y_scaled,
      -500n
    );

    assert.equal(
      result.end_x_scaled,
      -900n
    );
  }
);


test(
  "stationary scaled position is a valid segment",
  () => {
    const result =
      buildTrajectorySegmentV1({
        physicsStepMs:
          10,

        fromSample: {
          step_index:
            2,

          elapsed_ms:
            20,

          x_scaled:
            1000n,

          y_scaled:
            2000n,
        },

        toSample: {
          step_index:
            3,

          elapsed_ms:
            30,

          x_scaled:
            1000n,

          y_scaled:
            2000n,
        },
      });

    assert.equal(
      result.delta_x_scaled,
      0n
    );

    assert.equal(
      result.delta_y_scaled,
      0n
    );
  }
);


test(
  "non-adjacent step indexes fail closed",
  () => {
    assert.throws(
      () =>
        buildTrajectorySegmentV1({
          physicsStepMs:
            10,

          fromSample: {
            step_index:
              1,

            elapsed_ms:
              10,

            x_scaled:
              0n,

            y_scaled:
              0n,
          },

          toSample: {
            step_index:
              3,

            elapsed_ms:
              30,

            x_scaled:
              1n,

            y_scaled:
              1n,
          },
        }),
      {
        code:
          "CING_ARTILLERY_TRAJECTORY_SEGMENT_NON_ADJACENT_STEPS",
      }
    );
  }
);


test(
  "reversed step indexes fail closed",
  () => {
    assert.throws(
      () =>
        buildTrajectorySegmentV1({
          physicsStepMs:
            10,

          fromSample: {
            step_index:
              4,

            elapsed_ms:
              40,

            x_scaled:
              0n,

            y_scaled:
              0n,
          },

          toSample: {
            step_index:
              3,

            elapsed_ms:
              30,

            x_scaled:
              1n,

            y_scaled:
              1n,
          },
        }),
      {
        code:
          "CING_ARTILLERY_TRAJECTORY_SEGMENT_NON_ADJACENT_STEPS",
      }
    );
  }
);


test(
  "elapsed time must match exactly one physics step",
  () => {
    assert.throws(
      () =>
        buildTrajectorySegmentV1({
          physicsStepMs:
            10,

          fromSample: {
            step_index:
              2,

            elapsed_ms:
              20,

            x_scaled:
              0n,

            y_scaled:
              0n,
          },

          toSample: {
            step_index:
              3,

            elapsed_ms:
              31,

            x_scaled:
              1n,

            y_scaled:
              1n,
          },
        }),
      {
        code:
          "CING_ARTILLERY_TRAJECTORY_SEGMENT_TIME_MISMATCH",
      }
    );
  }
);


test(
  "sample coordinates must remain BigInt",
  () => {
    assert.throws(
      () =>
        buildTrajectorySegmentV1({
          physicsStepMs:
            10,

          fromSample: {
            step_index:
              0,

            elapsed_ms:
              0,

            x_scaled:
              0,

            y_scaled:
              0n,
          },

          toSample: {
            step_index:
              1,

            elapsed_ms:
              10,

            x_scaled:
              1n,

            y_scaled:
              1n,
          },
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_TRAJECTORY_SEGMENT_V1",
      }
    );
  }
);


test(
  "missing sample fails closed",
  () => {
    assert.throws(
      () =>
        buildTrajectorySegmentV1({
          physicsStepMs:
            10,

          fromSample:
            null,

          toSample: {
            step_index:
              1,

            elapsed_ms:
              10,

            x_scaled:
              1n,

            y_scaled:
              1n,
          },
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_TRAJECTORY_SEGMENT_V1",
      }
    );
  }
);


test(
  "physics step must be a positive safe integer",
  () => {
    for (
      const physicsStepMs of [
        0,
        -1,
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
      ]
    ) {
      assert.throws(
        () =>
          buildTrajectorySegmentV1({
            physicsStepMs,

            fromSample: {
              step_index:
                0,

              elapsed_ms:
                0,

              x_scaled:
                0n,

              y_scaled:
                0n,
            },

            toSample: {
              step_index:
                1,

              elapsed_ms:
                10,

              x_scaled:
                1n,

              y_scaled:
                1n,
            },
          }),
        {
          code:
            "CING_ARTILLERY_INVALID_TRAJECTORY_SEGMENT_V1",
        }
      );
    }
  }
);
