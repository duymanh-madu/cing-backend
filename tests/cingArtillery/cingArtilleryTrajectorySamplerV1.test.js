"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  MAX_TRAJECTORY_STEPS_V1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryGameRulesContracts"
  );

const {
  sampleTrajectoryV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryTrajectorySamplerV1"
  );


function base(
  overrides = {}
) {
  return {
    physicsVersion:
      1,

    physicsStepMs:
      10,

    maxFlightTimeMs:
      1000,

    stepIndex:
      0,

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
  };
}


test(
  "step zero is exactly the immutable initial shot state",
  () => {
    const result =
      sampleTrajectoryV1(
        base()
      );

    assert.deepEqual(
      result,
      {
        step_index:
          0,

        elapsed_ms:
          0,

        x_scaled:
          100000n,

        y_scaled:
          100000n,

        vx_scaled:
          70710n,

        vy_scaled:
          -70710n,
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
  "first fixed step matches canonical ballistic golden value",
  () => {
    const result =
      sampleTrajectoryV1(
        base({
          stepIndex:
            1,
        })
      );

    assert.deepEqual(
      result,
      {
        step_index:
          1,

        elapsed_ms:
          10,

        x_scaled:
          100707n,

        y_scaled:
          99342n,

        vx_scaled:
          70710n,

        vy_scaled:
          -60910n,
      }
    );
  }
);


test(
  "left launch is exact horizontal mirror when acceleration is mirrored",
  () => {
    const right =
      sampleTrajectoryV1(
        base({
          stepIndex:
            10,

          axScaled:
            100000n,
        })
      );

    const left =
      sampleTrajectoryV1(
        base({
          stepIndex:
            10,

          initialVxScaled:
            -70710n,

          axScaled:
            -100000n,
        })
      );

    assert.equal(
      right.x_scaled,
      107571n
    );

    assert.equal(
      left.x_scaled,
      92429n
    );

    assert.equal(
      right.x_scaled -
        100000n,
      -(
        left.x_scaled -
        100000n
      )
    );

    assert.equal(
      left.vx_scaled,
      -right.vx_scaled
    );

    assert.equal(
      left.y_scaled,
      right.y_scaled
    );

    assert.equal(
      left.vy_scaled,
      right.vy_scaled
    );
  }
);


test(
  "positive wind golden sample at 100 ms is deterministic",
  () => {
    const result =
      sampleTrajectoryV1(
        base({
          stepIndex:
            10,

          axScaled:
            100000n,
        })
      );

    assert.deepEqual(
      result,
      {
        step_index:
          10,

        elapsed_ms:
          100,

        x_scaled:
          107571n,

        y_scaled:
          97829n,

        vx_scaled:
          80710n,

        vy_scaled:
          27290n,
      }
    );
  }
);


test(
  "sample N is independent of any previous sample evaluation",
  () => {
    const direct =
      sampleTrajectoryV1(
        base({
          stepIndex:
            73,

          axScaled:
            -35000n,
        })
      );

    for (
      let step = 0;
      step < 73;
      step += 1
    ) {
      sampleTrajectoryV1(
        base({
          stepIndex:
            step,

          axScaled:
            -35000n,
        })
      );
    }

    const afterEarlierSamples =
      sampleTrajectoryV1(
        base({
          stepIndex:
            73,

          axScaled:
            -35000n,
        })
      );

    assert.deepEqual(
      afterEarlierSamples,
      direct
    );
  }
);


test(
  "trajectory sampler permits negative post-launch world coordinates",
  () => {
    const result =
      sampleTrajectoryV1({
        ...base(),

        stepIndex:
          10,

        originXScaled:
          1000n,

        initialVxScaled:
          -100000n,

        initialVyScaled:
          0n,

        axScaled:
          0n,

        ayScaled:
          1n,
      });

    assert.ok(
      result.x_scaled <
      0n
    );
  }
);


test(
  "last canonical trajectory step is accepted",
  () => {
    const result =
      sampleTrajectoryV1(
        base({
          physicsStepMs:
            1,

          maxFlightTimeMs:
            MAX_TRAJECTORY_STEPS_V1,

          stepIndex:
            MAX_TRAJECTORY_STEPS_V1,
        })
      );

    assert.equal(
      result.step_index,
      MAX_TRAJECTORY_STEPS_V1
    );

    assert.equal(
      result.elapsed_ms,
      MAX_TRAJECTORY_STEPS_V1
    );
  }
);


test(
  "step beyond flight horizon fails closed",
  () => {
    assert.throws(
      () =>
        sampleTrajectoryV1(
          base({
            stepIndex:
              101,
          })
        ),
      {
        code:
          "CING_ARTILLERY_TRAJECTORY_STEP_OUT_OF_RANGE",
      }
    );
  }
);


test(
  "negative and fractional step indexes fail closed",
  () => {
    assert.throws(
      () =>
        sampleTrajectoryV1(
          base({
            stepIndex:
              -1,
          })
        ),
      {
        code:
          "CING_ARTILLERY_INVALID_TRAJECTORY_SAMPLER_V1",
      }
    );

    assert.throws(
      () =>
        sampleTrajectoryV1(
          base({
            stepIndex:
              1.5,
          })
        ),
      {
        code:
          "CING_ARTILLERY_INVALID_TRAJECTORY_SAMPLER_V1",
      }
    );
  }
);


test(
  "non-divisible flight horizon fails closed",
  () => {
    assert.throws(
      () =>
        sampleTrajectoryV1(
          base({
            physicsStepMs:
              16,

            maxFlightTimeMs:
              1000,
          })
        ),
      {
        code:
          "CING_ARTILLERY_TRAJECTORY_HORIZON_INVALID",
      }
    );
  }
);


test(
  "trajectory computational budget is enforced independently",
  () => {
    assert.throws(
      () =>
        sampleTrajectoryV1(
          base({
            physicsStepMs:
              1,

            maxFlightTimeMs:
              MAX_TRAJECTORY_STEPS_V1 +
              1,
          })
        ),
      {
        code:
          "CING_ARTILLERY_TRAJECTORY_STEP_BUDGET_EXCEEDED",
      }
    );
  }
);


test(
  "unsupported physics version fails through semantic authority",
  () => {
    assert.throws(
      () =>
        sampleTrajectoryV1(
          base({
            physicsVersion:
              2,
          })
        ),
      {
        code:
          "CING_ARTILLERY_UNSUPPORTED_PHYSICS_VERSION",
      }
    );
  }
);


test(
  "all canonical vector inputs must be BigInt",
  () => {
    const fields = [
      "originXScaled",
      "originYScaled",
      "initialVxScaled",
      "initialVyScaled",
      "axScaled",
      "ayScaled",
    ];

    for (
      const field of fields
    ) {
      assert.throws(
        () =>
          sampleTrajectoryV1(
            base({
              [field]:
                1,
            })
          ),
        {
          code:
            "CING_ARTILLERY_INVALID_TRAJECTORY_SAMPLER_V1",
        }
      );
    }
  }
);


test(
  "tiny mirrored signed acceleration quantizes symmetrically",
  () => {
    const positive =
      sampleTrajectoryV1(
        base({
          physicsStepMs:
            1,

          maxFlightTimeMs:
            100,

          stepIndex:
            1,

          initialVxScaled:
            0n,

          initialVyScaled:
            0n,

          axScaled:
            1n,

          ayScaled:
            1n,
        })
      );

    const negativeX =
      sampleTrajectoryV1(
        base({
          physicsStepMs:
            1,

          maxFlightTimeMs:
            100,

          stepIndex:
            1,

          initialVxScaled:
            0n,

          initialVyScaled:
            0n,

          axScaled:
            -1n,

          ayScaled:
            1n,
        })
      );

    assert.equal(
      positive.vx_scaled,
      0n
    );

    assert.equal(
      negativeX.vx_scaled,
      0n
    );

    assert.equal(
      positive.x_scaled -
        positive.x_scaled,
      0n
    );

    assert.equal(
      positive.x_scaled,
      negativeX.x_scaled
    );
  }
);
