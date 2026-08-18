"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SHOT SEGMENT IMPACT PROJECTION V1
 *
 * Projects the winning event of exactly one trajectory
 * segment into its exact impact representation.
 *
 * Input:
 *
 *   trajectorySegment
 *
 *   segmentEvent:
 *
 *     null
 *
 *     or the immutable output of
 *     CollisionWorldExitPrecedenceV1 /
 *     ShotSegmentEventClassifierV1.
 *
 * Semantics:
 *
 *   no segment event
 *     -> null
 *
 *   collision
 *     -> exact SegmentContactPointV1
 *
 *   world_exit
 *     -> null
 *
 * World exits intentionally have no durable impact
 * coordinates under the locked shot-resolution shape.
 *
 * IMPORTANT:
 *
 * Collision contact coordinates are not necessarily
 * rational numbers. The exact SegmentContactPointV1
 * representation therefore remains symbolic when the
 * ContactParameterV1 is irrational.
 *
 * This module does NOT:
 *
 *   calculate collision
 *   calculate world exit
 *   compare precedence
 *   derive contact parameter
 *   approximate irrational coordinates
 *   quantize coordinates
 *   call sqrt
 *   convert to decimal
 *   convert to PostgreSQL numeric
 *   produce impact_x / impact_y
 *   produce player_hit / terrain_hit / out_of_bounds
 *   identify target
 *   calculate damage
 *   mutate HP
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1,
} =
  require(
    "./cingArtilleryCollisionWorldExitPrecedenceV1"
  );

const {
  createSegmentContactPointV1,
} =
  require(
    "./cingArtillerySegmentContactPointV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_SHOT_SEGMENT_IMPACT_PROJECTION_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function assertSegmentEventEnvelope(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    throw buildError({
      message:
        "Shot segment impact projection Cing Artillery có segment_event không hợp lệ",
    });
  }


  return value;
}


function projectShotSegmentImpactV1({
  trajectorySegment,
  segmentEvent,
} = {}) {
  if (
    segmentEvent ===
      null
  ) {
    return null;
  }


  const event =
    assertSegmentEventEnvelope(
      segmentEvent
    );


  if (
    event.segment_event_kind ===
      COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1.WORLD_EXIT
  ) {
    return null;
  }


  if (
    event.segment_event_kind !==
      COLLISION_WORLD_EXIT_SEGMENT_EVENT_KIND_V1.COLLISION
  ) {
    throw buildError({
      message:
        "Shot segment impact projection Cing Artillery không hỗ trợ segment_event_kind",
    });
  }


  return createSegmentContactPointV1({
    trajectorySegment,

    contactParameter:
      event.contact_parameter,
  });
}


module.exports = {
  projectShotSegmentImpactV1,
};
