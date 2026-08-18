"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  createRationalContactParameterV1,
  createQuadraticLowerRootContactParameterV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryContactParameterV1"
  );

const {
  createSegmentContactPointV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtillerySegmentContactPointV1"
  );

const {
  projectShotSegmentImpactV1,
} =
  require(
    "../../services/games/cingArtillery/domain/cingArtilleryShotSegmentImpactProjectionV1"
  );


function segment({
  startX =
    1000n,

  startY =
    2000n,

  endX =
    5000n,

  endY =
    6000n,
} = {}) {
  return {
    start_x_scaled:
      startX,

    start_y_scaled:
      startY,

    end_x_scaled:
      endX,

    end_y_scaled:
      endY,
  };
}


function rational(
  numerator,
  denominator
) {
  return createRationalContactParameterV1({
    numerator,
    denominator,
  });
}


function collisionEvent({
  collisionKind =
    "player",

  parameter =
    rational(
      1n,
      2n
    ),
} = {}) {
  return Object.freeze({
    segment_event_kind:
      "collision",

    collision_kind:
      collisionKind,

    world_exit_kind:
      null,

    contact_parameter:
      parameter,
  });
}


function worldExitEvent({
  worldExitKind =
    "boundary_exit",

  parameter =
    rational(
      3n,
      4n
    ),
} = {}) {
  return Object.freeze({
    segment_event_kind:
      "world_exit",

    collision_kind:
      null,

    world_exit_kind:
      worldExitKind,

    contact_parameter:
      parameter,
  });
}


test(
  "no segment event has no impact point",
  () => {
    assert.equal(
      projectShotSegmentImpactV1({
        trajectorySegment:
          segment(),

        segmentEvent:
          null,
      }),
      null
    );
  }
);


test(
  "player collision projects exact rational contact point",
  () => {
    const parameter =
      rational(
        1n,
        2n
      );

    const result =
      projectShotSegmentImpactV1({
        trajectorySegment:
          segment(),

        segmentEvent:
          collisionEvent({
            collisionKind:
              "player",

            parameter,
          }),
      });


    assert.deepEqual(
      result,
      createSegmentContactPointV1({
        trajectorySegment:
          segment(),

        contactParameter:
          parameter,
      })
    );
  }
);


test(
  "terrain collision projects exact contact point identically",
  () => {
    const parameter =
      rational(
        1n,
        4n
      );

    const result =
      projectShotSegmentImpactV1({
        trajectorySegment:
          segment(),

        segmentEvent:
          collisionEvent({
            collisionKind:
              "terrain",

            parameter,
          }),
      });


    assert.equal(
      result.x_coordinate.contact_parameter,
      parameter
    );

    assert.equal(
      result.y_coordinate.contact_parameter,
      parameter
    );
  }
);


test(
  "irrational player collision remains exact symbolic impact point",
  () => {
    const parameter =
      createQuadraticLowerRootContactParameterV1({
        a:
          1n,

        b:
          -3n,

        discriminant:
          5n,
      });


    const result =
      projectShotSegmentImpactV1({
        trajectorySegment:
          segment(),

        segmentEvent:
          collisionEvent({
            parameter,
          }),
      });


    assert.equal(
      result.x_coordinate.contact_parameter,
      parameter
    );

    assert.equal(
      result.y_coordinate.contact_parameter,
      parameter
    );

    assert.equal(
      result.x_coordinate.contact_parameter.kind,
      "quadratic_lower_root"
    );
  }
);


test(
  "boundary world exit intentionally has no impact point",
  () => {
    assert.equal(
      projectShotSegmentImpactV1({
        trajectorySegment:
          segment(),

        segmentEvent:
          worldExitEvent({
            worldExitKind:
              "boundary_exit",
          }),
      }),
      null
    );
  }
);


test(
  "already_outside intentionally has no impact point",
  () => {
    assert.equal(
      projectShotSegmentImpactV1({
        trajectorySegment:
          segment(),

        segmentEvent:
          worldExitEvent({
            worldExitKind:
              "already_outside",

            parameter:
              rational(
                0n,
                1n
              ),
          }),
      }),
      null
    );
  }
);


test(
  "collision impact result is frozen through exact point authority",
  () => {
    const result =
      projectShotSegmentImpactV1({
        trajectorySegment:
          segment(),

        segmentEvent:
          collisionEvent(),
      });


    assert.ok(
      Object.isFrozen(
        result
      )
    );

    assert.ok(
      Object.isFrozen(
        result.x_coordinate
      )
    );

    assert.ok(
      Object.isFrozen(
        result.y_coordinate
      )
    );
  }
);


test(
  "negative trajectory delta remains exact in projected impact",
  () => {
    const result =
      projectShotSegmentImpactV1({
        trajectorySegment:
          segment({
            startX:
              5000n,

            startY:
              6000n,

            endX:
              1000n,

            endY:
              2000n,
          }),

        segmentEvent:
          collisionEvent({
            parameter:
              rational(
                1n,
                3n
              ),
          }),
      });


    assert.equal(
      result.x_coordinate.delta_scaled,
      -4000n
    );

    assert.equal(
      result.y_coordinate.delta_scaled,
      -4000n
    );
  }
);


test(
  "non-canonical collision contact fails through exact contact-point authority",
  () => {
    assert.throws(
      () =>
        projectShotSegmentImpactV1({
          trajectorySegment:
            segment(),

          segmentEvent: {
            segment_event_kind:
              "collision",

            collision_kind:
              "player",

            world_exit_kind:
              null,

            contact_parameter: {
              kind:
                "rational",

              numerator:
                2n,

              denominator:
                4n,
            },
          },
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SEGMENT_CONTACT_POINT_V1",
      }
    );
  }
);


test(
  "unknown segment event kind fails closed",
  () => {
    assert.throws(
      () =>
        projectShotSegmentImpactV1({
          trajectorySegment:
            segment(),

          segmentEvent: {
            segment_event_kind:
              "unknown",

            contact_parameter:
              rational(
                1n,
                2n
              ),
          },
        }),
      {
        code:
          "CING_ARTILLERY_INVALID_SHOT_SEGMENT_IMPACT_PROJECTION_V1",
      }
    );
  }
);


test(
  "missing projection envelope fails closed",
  () => {
    assert.throws(
      () =>
        projectShotSegmentImpactV1(),
      {
        code:
          "CING_ARTILLERY_INVALID_SHOT_SEGMENT_IMPACT_PROJECTION_V1",
      }
    );
  }
);
