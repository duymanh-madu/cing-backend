"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SHOT TRAJECTORY SOLVER V1
 *
 * Shot-level deterministic orchestration over the locked
 * Physics V1 authorities.
 *
 * Canonical loop:
 *
 *   sample[0]
 *
 *   for step = 1 .. max_step_index:
 *
 *     sample[step]
 *
 *     segment =
 *       sample[step - 1]
 *       ->
 *       sample[step]
 *
 *     classify exactly one segment
 *
 *     if terminal event exists:
 *       stop immediately
 *
 * No sample after the terminal segment is evaluated.
 *
 * Terminal semantics:
 *
 *   collision/player
 *     -> player_hit
 *
 *   collision/terrain
 *     -> terrain_hit
 *
 *   world_exit
 *     -> out_of_bounds
 *
 *   no segment event through max_flight_time_ms
 *     -> flight_horizon_exhausted
 *
 * Collision terminal events additionally receive:
 *
 *   exact SegmentContactPointV1
 *   deterministic ImpactNumericProjectionV1
 *
 * World exit and flight-horizon exhaustion intentionally
 * have no impact coordinates.
 *
 * This module does NOT:
 *
 *   derive launch vector
 *   derive muzzle origin
 *   derive player collider
 *   derive collision geometry numeric rules
 *   calculate damage
 *   identify target account
 *   mutate HP
 *   write PostgreSQL
 *   complete shot execution
 *   advance turn
 *   emit realtime events
 */

const {
  MAX_TRAJECTORY_STEPS_V1,
} =
  require(
    "./cingArtilleryGameRulesContracts"
  );

const {
  sampleTrajectoryV1,
} =
  require(
    "./cingArtilleryTrajectorySamplerV1"
  );

const {
  buildTrajectorySegmentV1,
} =
  require(
    "./cingArtilleryTrajectorySegmentV1"
  );

const {
  classifyShotSegmentEventV1,
} =
  require(
    "./cingArtilleryShotSegmentEventClassifierV1"
  );

const {
  COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1,
} =
  require(
    "./cingArtilleryCollisionWorldExitPrecedenceV1"
  );

const {
  PLAYER_TERRAIN_COLLISION_KIND_V1,
} =
  require(
    "./cingArtilleryPlayerTerrainCollisionPrecedenceV1"
  );

const {
  projectShotSegmentImpactV1,
} =
  require(
    "./cingArtilleryShotSegmentImpactProjectionV1"
  );

const {
  projectImpactNumericV1,
} =
  require(
    "./cingArtilleryImpactNumericProjectionV1"
  );

const {
  createTrajectoryPresentationCollectorV1,
} =
  require(
    "./cingArtilleryTrajectoryPresentationV1"
  );


const SHOT_TRAJECTORY_SOLVER_OUTCOME_V1 =
  Object.freeze({
    PLAYER_HIT:
      "player_hit",

    TERRAIN_HIT:
      "terrain_hit",

    OUT_OF_BOUNDS:
      "out_of_bounds",

    FLIGHT_HORIZON_EXHAUSTED:
      "flight_horizon_exhausted",
  });


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_SHOT_TRAJECTORY_SOLVER_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function assertPositiveSafeInteger(
  value,
  field
) {
  if (
    typeof value !==
      "number" ||
    !Number.isSafeInteger(
      value
    ) ||
    value <=
      0
  ) {
    throw buildError({
      message:
        `Shot trajectory solver Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function normalizeSolverHorizonV1({
  physicsStepMs,
  maxFlightTimeMs,
}) {
  const stepMs =
    assertPositiveSafeInteger(
      physicsStepMs,
      "physics_step_ms"
    );

  const flightMs =
    assertPositiveSafeInteger(
      maxFlightTimeMs,
      "max_flight_time_ms"
    );


  if (
    flightMs <=
      stepMs ||
    (
      flightMs %
      stepMs
    ) !==
      0
  ) {
    throw buildError({
      message:
        "Shot trajectory solver Cing Artillery có fixed-step horizon không hợp lệ",
      code:
        "CING_ARTILLERY_SHOT_TRAJECTORY_SOLVER_HORIZON_INVALID",
    });
  }


  const maxStepIndex =
    flightMs /
    stepMs;


  if (
    maxStepIndex >
      MAX_TRAJECTORY_STEPS_V1
  ) {
    throw buildError({
      message:
        "Shot trajectory solver Cing Artillery vượt computational step budget",
      code:
        "CING_ARTILLERY_SHOT_TRAJECTORY_SOLVER_STEP_BUDGET_EXCEEDED",
    });
  }


  return Object.freeze({
    physics_step_ms:
      stepMs,

    max_flight_time_ms:
      flightMs,

    max_step_index:
      maxStepIndex,
  });
}


function deriveCollisionOutcomeV1(
  collisionKind
) {
  if (
    collisionKind ===
      PLAYER_TERRAIN_COLLISION_KIND_V1.PLAYER
  ) {
    return SHOT_TRAJECTORY_SOLVER_OUTCOME_V1.PLAYER_HIT;
  }


  if (
    collisionKind ===
      PLAYER_TERRAIN_COLLISION_KIND_V1.TERRAIN
  ) {
    return SHOT_TRAJECTORY_SOLVER_OUTCOME_V1.TERRAIN_HIT;
  }


  throw buildError({
    message:
      "Shot trajectory solver Cing Artillery gặp collision_kind không hỗ trợ",
  });
}


function solveShotTrajectoryV1({
  physicsVersion,
  physicsStepMs,
  maxFlightTimeMs,
  physicsFixedScale,

  originXScaled,
  originYScaled,

  initialVxScaled,
  initialVyScaled,

  axScaled,
  ayScaled,

  projectileRadiusScaled,
  playerCollider,

  widthPx,
  heightPx,
  collisionMask,
} = {}) {
  const horizon =
    normalizeSolverHorizonV1({
      physicsStepMs,
      maxFlightTimeMs,
    });


  const samplerInput = {
    physicsVersion,

    physicsStepMs:
      horizon.physics_step_ms,

    maxFlightTimeMs:
      horizon.max_flight_time_ms,

    originXScaled,
    originYScaled,

    initialVxScaled,
    initialVyScaled,

    axScaled,
    ayScaled,
  };


  let previousSample =
    sampleTrajectoryV1({
      ...samplerInput,

      stepIndex:
        0,
    });


  const presentationCollector =
    createTrajectoryPresentationCollectorV1({
      maxStepIndex:
        horizon.max_step_index,

      physicsFixedScale,
    });

  presentationCollector.capture(
    previousSample
  );


  let lastSegment =
    null;


  for (
    let stepIndex =
      1;

    stepIndex <=
      horizon.max_step_index;

    stepIndex +=
      1
  ) {
    const currentSample =
      sampleTrajectoryV1({
        ...samplerInput,

        stepIndex,
      });


    const trajectorySegment =
      buildTrajectorySegmentV1({
        physicsStepMs:
          horizon.physics_step_ms,

        fromSample:
          previousSample,

        toSample:
          currentSample,
      });


    lastSegment =
      trajectorySegment;


    const segmentEvent =
      classifyShotSegmentEventV1({
        trajectorySegment,

        projectileRadiusScaled,
        playerCollider,

        physicsFixedScale,

        widthPx,
        heightPx,
        collisionMask,
      });


    if (
      segmentEvent !==
        null
    ) {
      if (
        segmentEvent.segment_event_kind ===
          COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1.WORLD_EXIT
      ) {
        return Object.freeze({
          outcome:
            SHOT_TRAJECTORY_SOLVER_OUTCOME_V1.OUT_OF_BOUNDS,

          terminal_step_index:
            trajectorySegment.to_step_index,

          terminal_elapsed_ms:
            trajectorySegment.to_elapsed_ms,

          trajectory_segment:
            trajectorySegment,

          segment_event:
            segmentEvent,

          exact_impact:
            null,

          numeric_impact:
            null,

          trajectory_presentation:
            presentationCollector
              .finalize(
                currentSample
              ),
        });
      }


      if (
        segmentEvent.segment_event_kind !==
          COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1.COLLISION
      ) {
        throw buildError({
          message:
            "Shot trajectory solver Cing Artillery gặp segment_event_kind không hỗ trợ",
        });
      }


      const exactImpact =
        projectShotSegmentImpactV1({
          trajectorySegment,

          segmentEvent,
        });


      if (
        exactImpact ===
          null
      ) {
        throw buildError({
          message:
            "Shot trajectory solver Cing Artillery có collision nhưng thiếu exact impact",
          code:
            "CING_ARTILLERY_SHOT_TRAJECTORY_SOLVER_COLLISION_IMPACT_MISSING",
        });
      }


      const numericImpact =
        projectImpactNumericV1({
          exactImpactPoint:
            exactImpact,

          physicsFixedScale,
        });


      return Object.freeze({
        outcome:
          deriveCollisionOutcomeV1(
            segmentEvent.collision_kind
          ),

        terminal_step_index:
          trajectorySegment.to_step_index,

        terminal_elapsed_ms:
          trajectorySegment.to_elapsed_ms,

        trajectory_segment:
          trajectorySegment,

        segment_event:
          segmentEvent,

        exact_impact:
          exactImpact,

        numeric_impact:
          numericImpact,

        trajectory_presentation:
          presentationCollector
            .finalize(
              previousSample
            ),
      });
    }


    presentationCollector.capture(
      currentSample
    );

    previousSample =
      currentSample;
  }


  if (
    lastSegment ===
      null
  ) {
    throw buildError({
      message:
        "Shot trajectory solver Cing Artillery không tạo được canonical trajectory segment",
      code:
        "CING_ARTILLERY_SHOT_TRAJECTORY_SOLVER_NO_SEGMENT",
    });
  }


  return Object.freeze({
    outcome:
      SHOT_TRAJECTORY_SOLVER_OUTCOME_V1.FLIGHT_HORIZON_EXHAUSTED,

    terminal_step_index:
      lastSegment.to_step_index,

    terminal_elapsed_ms:
      lastSegment.to_elapsed_ms,

    trajectory_segment:
      lastSegment,

    segment_event:
      null,

    exact_impact:
      null,

    numeric_impact:
      null,

    trajectory_presentation:
      presentationCollector
        .finalize(
          previousSample
        ),
  });
}


module.exports = {
  SHOT_TRAJECTORY_SOLVER_OUTCOME_V1,
  solveShotTrajectoryV1,
};
