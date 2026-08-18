"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  SHOT_TRAJECTORY_SOLVER_OUTCOME_V1,
  solveShotTrajectoryV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryShotTrajectorySolverV1"
  );


function makeMask({
  widthPx,
  heightPx,
  solidCells =
    [],
}) {
  const rowBytes =
    Math.ceil(
      widthPx /
      8
    );

  const mask =
    Buffer.alloc(
      rowBytes *
      heightPx
    );


  for (
    const [
      x,
      y,
    ]
    of solidCells
  ) {
    const byteIndex =
      y *
      rowBytes +
      Math.floor(
        x /
        8
      );

    const bitIndex =
      7 -
      (
        x %
        8
      );

    mask[byteIndex] |=
      1 <<
      bitIndex;
  }


  return mask;
}


function baseInput(
  overrides =
    {}
) {
  const widthPx =
    overrides.widthPx ??
    1000;

  const heightPx =
    overrides.heightPx ??
    100;


  return {
    physicsVersion:
      1,

    physicsStepMs:
      100,

    maxFlightTimeMs:
      300,

    physicsFixedScale:
      1000,

    originXScaled:
      100000n,

    originYScaled:
      50000n,

    initialVxScaled:
      1000n,

    initialVyScaled:
      0n,

    axScaled:
      0n,

    ayScaled:
      1n,

    projectileRadiusScaled:
      100n,

    playerCollider: {
      center_x_scaled:
        900000n,

      center_y_scaled:
        90000n,

      radius_scaled:
        100n,
    },

    widthPx,
    heightPx,

    collisionMask:
      makeMask({
        widthPx,
        heightPx,
      }),

    ...overrides,
  };
}


test(
  "solver outcome contract is immutable and explicit",
  () => {
    assert.deepEqual(
      SHOT_TRAJECTORY_SOLVER_OUTCOME_V1,
      {
        PLAYER_HIT:
          "player_hit",

        TERRAIN_HIT:
          "terrain_hit",

        OUT_OF_BOUNDS:
          "out_of_bounds",

        FLIGHT_HORIZON_EXHAUSTED:
          "flight_horizon_exhausted",
      }
    );

    assert.ok(
      Object.isFrozen(
        SHOT_TRAJECTORY_SOLVER_OUTCOME_V1
      )
    );
  }
);


test(
  "no event through final canonical segment terminates as flight_horizon_exhausted",
  () => {
    const result =
      solveShotTrajectoryV1(
        baseInput()
      );


    assert.equal(
      result.outcome,
      "flight_horizon_exhausted"
    );

    assert.equal(
      result.terminal_step_index,
      3
    );

    assert.equal(
      result.terminal_elapsed_ms,
      300
    );

    assert.equal(
      result.trajectory_segment.from_step_index,
      2
    );

    assert.equal(
      result.trajectory_segment.to_step_index,
      3
    );

    assert.equal(
      result.segment_event,
      null
    );

    assert.equal(
      result.exact_impact,
      null
    );

    assert.equal(
      result.numeric_impact,
      null
    );

    assert.ok(
      Object.isFrozen(
        result
      )
    );
  }
);


test(
  "player collision terminates on earliest segment with exact and numeric impact",
  () => {
    const result =
      solveShotTrajectoryV1(
        baseInput({
          originXScaled:
            1000n,

          originYScaled:
            1000n,

          initialVxScaled:
            10000n,

          maxFlightTimeMs:
            500,

          widthPx:
            20,

          heightPx:
            10,

          playerCollider: {
            center_x_scaled:
              2000n,

            center_y_scaled:
              1000n,

            radius_scaled:
              100n,
          },

          collisionMask:
            makeMask({
              widthPx:
                20,

              heightPx:
                10,
            }),
        })
      );


    assert.equal(
      result.outcome,
      "player_hit"
    );

    assert.equal(
      result.terminal_step_index,
      1
    );

    assert.equal(
      result.terminal_elapsed_ms,
      100
    );

    assert.equal(
      result.segment_event.segment_event_kind,
      "collision"
    );

    assert.equal(
      result.segment_event.collision_kind,
      "player"
    );

    assert.ok(
      result.exact_impact
    );

    assert.equal(
      result.numeric_impact.projection_version,
      1
    );

    assert.equal(
      typeof result.numeric_impact.impact_x,
      "string"
    );

    assert.equal(
      typeof result.numeric_impact.impact_y,
      "string"
    );
  }
);


test(
  "terrain collision terminates before later horizon",
  () => {
    const widthPx =
      20;

    const heightPx =
      10;


    const result =
      solveShotTrajectoryV1(
        baseInput({
          originXScaled:
            1000n,

          originYScaled:
            1500n,

          initialVxScaled:
            10000n,

          maxFlightTimeMs:
            500,

          widthPx,
          heightPx,

          playerCollider: {
            center_x_scaled:
              15000n,

            center_y_scaled:
              8000n,

            radius_scaled:
              100n,
          },

          collisionMask:
            makeMask({
              widthPx,
              heightPx,

              solidCells: [
                [2, 1],
              ],
            }),
        })
      );


    assert.equal(
      result.outcome,
      "terrain_hit"
    );

    assert.equal(
      result.terminal_step_index,
      1
    );

    assert.equal(
      result.segment_event.segment_event_kind,
      "collision"
    );

    assert.equal(
      result.segment_event.collision_kind,
      "terrain"
    );

    assert.ok(
      result.exact_impact
    );

    assert.ok(
      result.numeric_impact
    );
  }
);


test(
  "geometric world exit terminates as out_of_bounds with no impact",
  () => {
    const widthPx =
      10;

    const heightPx =
      10;


    const result =
      solveShotTrajectoryV1(
        baseInput({
          originXScaled:
            9800n,

          originYScaled:
            5000n,

          initialVxScaled:
            5000n,

          maxFlightTimeMs:
            500,

          widthPx,
          heightPx,

          playerCollider: {
            center_x_scaled:
              5000n,

            center_y_scaled:
              9000n,

            radius_scaled:
              100n,
          },

          collisionMask:
            makeMask({
              widthPx,
              heightPx,
            }),
        })
      );


    assert.equal(
      result.outcome,
      "out_of_bounds"
    );

    assert.equal(
      result.terminal_step_index,
      1
    );

    assert.equal(
      result.segment_event.segment_event_kind,
      "world_exit"
    );

    assert.equal(
      result.exact_impact,
      null
    );

    assert.equal(
      result.numeric_impact,
      null
    );
  }
);


test(
  "projectile already outside expanded world terminates on first segment",
  () => {
    const widthPx =
      10;

    const heightPx =
      10;


    const result =
      solveShotTrajectoryV1(
        baseInput({
          originXScaled:
            -500n,

          originYScaled:
            5000n,

          initialVxScaled:
            -1000n,

          maxFlightTimeMs:
            500,

          widthPx,
          heightPx,

          playerCollider: {
            center_x_scaled:
              5000n,

            center_y_scaled:
              9000n,

            radius_scaled:
              100n,
          },

          collisionMask:
            makeMask({
              widthPx,
              heightPx,
            }),
        })
      );


    assert.equal(
      result.outcome,
      "out_of_bounds"
    );

    assert.equal(
      result.terminal_step_index,
      1
    );

    assert.equal(
      result.segment_event.world_exit_kind,
      "already_outside"
    );
  }
);


test(
  "terminal collision on first segment prevents horizon result",
  () => {
    const widthPx =
      20;

    const heightPx =
      10;


    const result =
      solveShotTrajectoryV1(
        baseInput({
          originXScaled:
            1000n,

          originYScaled:
            1000n,

          initialVxScaled:
            10000n,

          maxFlightTimeMs:
            10000,

          widthPx,
          heightPx,

          playerCollider: {
            center_x_scaled:
              2000n,

            center_y_scaled:
              1000n,

            radius_scaled:
              100n,
          },

          collisionMask:
            makeMask({
              widthPx,
              heightPx,
            }),
        })
      );


    assert.equal(
      result.terminal_step_index,
      1
    );

    assert.equal(
      result.outcome,
      "player_hit"
    );
  }
);


test(
  "non-divisible horizon fails closed before simulation",
  () => {
    assert.throws(
      () =>
        solveShotTrajectoryV1(
          baseInput({
            maxFlightTimeMs:
              350,
          })
        ),
      {
        code:
          "CING_ARTILLERY_SHOT_TRAJECTORY_SOLVER_HORIZON_INVALID",
      }
    );
  }
);


test(
  "unsupported physics version fails through sampler authority",
  () => {
    assert.throws(
      () =>
        solveShotTrajectoryV1(
          baseInput({
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
  "invalid collision mask fails through locked segment-event authority",
  () => {
    assert.throws(
      () =>
        solveShotTrajectoryV1(
          baseInput({
            collisionMask:
              Buffer.alloc(
                0
              ),
          })
        )
    );
  }
);


test(
  "invalid fixed-point trajectory scalar fails through sampler authority",
  () => {
    assert.throws(
      () =>
        solveShotTrajectoryV1(
          baseInput({
            originXScaled:
              1,
          })
        ),
      {
        code:
          "CING_ARTILLERY_INVALID_TRAJECTORY_SAMPLER_V1",
      }
    );
  }
);
