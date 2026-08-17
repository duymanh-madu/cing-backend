"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  normalizeAngleGridRulesV1,
  normalizeAngleOnGridV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryAngleGridV1"
  );


test(
  "integer-degree V2 angle grid normalizes exactly",
  () => {
    const grid =
      normalizeAngleGridRulesV1({
        angleMinDeg: 10,
        angleMaxDeg: 80,
        angleStepDeg: 1,
        physicsFixedScale: 1000,
      });

    assert.equal(
      grid.angle_min_deg_scaled,
      10000n
    );

    assert.equal(
      grid.angle_max_deg_scaled,
      80000n
    );

    assert.equal(
      grid.angle_step_deg_scaled,
      1000n
    );

    assert.equal(
      grid.step_count,
      70n
    );
  }
);


test(
  "fractional angle grid normalizes exactly when scale supports it",
  () => {
    const shot =
      normalizeAngleOnGridV1({
        angleDeg: 45.5,
        angleMinDeg: 10,
        angleMaxDeg: 80,
        angleStepDeg: 0.5,
        physicsFixedScale: 1000,
      });

    assert.equal(
      shot.angle_deg_scaled,
      45500n
    );

    assert.equal(
      shot.step_index,
      71n
    );
  }
);


test(
  "off-grid shot angle fails closed",
  () => {
    assert.throws(
      () =>
        normalizeAngleOnGridV1({
          angleDeg: 45.25,
          angleMinDeg: 10,
          angleMaxDeg: 80,
          angleStepDeg: 0.5,
          physicsFixedScale: 1000,
        }),
      {
        code:
          "CING_ARTILLERY_SHOT_ANGLE_NOT_ON_GRID",
      }
    );
  }
);


test(
  "angle grid range must divide exactly by step",
  () => {
    assert.throws(
      () =>
        normalizeAngleGridRulesV1({
          angleMinDeg: 10,
          angleMaxDeg: 80,
          angleStepDeg: 3,
          physicsFixedScale: 1000,
        }),
      {
        code:
          "CING_ARTILLERY_ANGLE_GRID_RANGE_MISALIGNED",
      }
    );
  }
);


test(
  "angle precision outside fixed lattice fails closed",
  () => {
    assert.throws(
      () =>
        normalizeAngleOnGridV1({
          angleDeg: 45.0001,
          angleMinDeg: 10,
          angleMaxDeg: 80,
          angleStepDeg: 0.001,
          physicsFixedScale: 1000,
        }),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      }
    );
  }
);


test(
  "angle step precision outside fixed lattice fails closed",
  () => {
    assert.throws(
      () =>
        normalizeAngleGridRulesV1({
          angleMinDeg: 10,
          angleMaxDeg: 80,
          angleStepDeg: 0.0001,
          physicsFixedScale: 1000,
        }),
      {
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      }
    );
  }
);


test(
  "angle grid boundaries are canonical shot points",
  () => {
    const minimum =
      normalizeAngleOnGridV1({
        angleDeg: 10,
        angleMinDeg: 10,
        angleMaxDeg: 80,
        angleStepDeg: 1,
        physicsFixedScale: 1000,
      });

    const maximum =
      normalizeAngleOnGridV1({
        angleDeg: 80,
        angleMinDeg: 10,
        angleMaxDeg: 80,
        angleStepDeg: 1,
        physicsFixedScale: 1000,
      });

    assert.equal(
      minimum.step_index,
      0n
    );

    assert.equal(
      maximum.step_index,
      70n
    );
  }
);


test(
  "shot outside configured grid range fails closed",
  () => {
    assert.throws(
      () =>
        normalizeAngleOnGridV1({
          angleDeg: 81,
          angleMinDeg: 10,
          angleMaxDeg: 80,
          angleStepDeg: 1,
          physicsFixedScale: 1000,
        }),
      {
        code:
          "CING_ARTILLERY_SHOT_ANGLE_OUT_OF_GRID_RANGE",
      }
    );
  }
);
