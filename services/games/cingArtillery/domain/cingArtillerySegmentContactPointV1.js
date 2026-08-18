"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SEGMENT CONTACT POINT REPRESENTATION V1
 *
 * Exact representation of a point on one canonical
 * trajectory segment.
 *
 * For one contact parameter:
 *
 *   t = ContactParameterV1
 *
 * coordinates are represented exactly as:
 *
 *   x =
 *     start_x_scaled +
 *     delta_x_scaled * t
 *
 *   y =
 *     start_y_scaled +
 *     delta_y_scaled * t
 *
 * No attempt is made to collapse an irrational contact
 * parameter into an approximate decimal coordinate.
 *
 * This representation therefore remains exact for:
 *
 *   rational t
 *   quadratic_lower_root t
 *
 * Output:
 *
 *   {
 *     kind:
 *       "affine_contact_point",
 *
 *     x_coordinate: {
 *       kind:
 *         "affine_contact_coordinate",
 *
 *       start_scaled:
 *         BigInt,
 *
 *       delta_scaled:
 *         BigInt,
 *
 *       contact_parameter:
 *         ContactParameterV1
 *     },
 *
 *     y_coordinate: {
 *       ...
 *     }
 *   }
 *
 * The same immutable ContactParameterV1 object is reused
 * by both axes.
 *
 * This module owns REPRESENTATION only.
 *
 * It does NOT:
 *
 *   calculate collision parameters
 *   compare event precedence
 *   call Math.sqrt
 *   use floating point
 *   quantize coordinates
 *   convert to decimal
 *   convert to PostgreSQL numeric
 *   decide impact_x / impact_y persistence
 *   know player / terrain / world-exit semantics
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  compareContactParametersV1,
} =
  require(
    "./cingArtilleryContactParameterComparatorV1"
  );


const SEGMENT_CONTACT_POINT_KIND_V1 =
  Object.freeze({
    POINT:
      "affine_contact_point",

    COORDINATE:
      "affine_contact_coordinate",
  });


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_SEGMENT_CONTACT_POINT_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function assertBigInt(
  value,
  field
) {
  if (
    typeof value !==
      "bigint"
  ) {
    throw buildError({
      message:
        `Segment contact point Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function assertCanonicalContactParameter(
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
        "Segment contact point Cing Artillery thiếu contact_parameter",
    });
  }


  try {
    compareContactParametersV1(
      value,
      value
    );
  } catch (error) {
    throw buildError({
      message:
        "Segment contact point Cing Artillery yêu cầu canonical ContactParameterV1",
    });
  }


  return value;
}


function assertTrajectorySegment(
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
        "Segment contact point Cing Artillery thiếu trajectory_segment",
    });
  }


  const startX =
    assertBigInt(
      value.start_x_scaled,
      "trajectory_segment.start_x_scaled"
    );

  const startY =
    assertBigInt(
      value.start_y_scaled,
      "trajectory_segment.start_y_scaled"
    );

  const endX =
    assertBigInt(
      value.end_x_scaled,
      "trajectory_segment.end_x_scaled"
    );

  const endY =
    assertBigInt(
      value.end_y_scaled,
      "trajectory_segment.end_y_scaled"
    );


  return {
    start_x_scaled:
      startX,

    start_y_scaled:
      startY,

    end_x_scaled:
      endX,

    end_y_scaled:
      endY,

    delta_x_scaled:
      endX -
      startX,

    delta_y_scaled:
      endY -
      startY,
  };
}


function createAffineContactCoordinateV1({
  startScaled,
  deltaScaled,
  contactParameter,
} = {}) {
  const start =
    assertBigInt(
      startScaled,
      "start_scaled"
    );

  const delta =
    assertBigInt(
      deltaScaled,
      "delta_scaled"
    );

  const parameter =
    assertCanonicalContactParameter(
      contactParameter
    );


  return Object.freeze({
    kind:
      SEGMENT_CONTACT_POINT_KIND_V1.COORDINATE,

    start_scaled:
      start,

    delta_scaled:
      delta,

    contact_parameter:
      parameter,
  });
}


function createSegmentContactPointV1({
  trajectorySegment,
  contactParameter,
} = {}) {
  const segment =
    assertTrajectorySegment(
      trajectorySegment
    );

  const parameter =
    assertCanonicalContactParameter(
      contactParameter
    );


  const xCoordinate =
    createAffineContactCoordinateV1({
      startScaled:
        segment.start_x_scaled,

      deltaScaled:
        segment.delta_x_scaled,

      contactParameter:
        parameter,
    });


  const yCoordinate =
    createAffineContactCoordinateV1({
      startScaled:
        segment.start_y_scaled,

      deltaScaled:
        segment.delta_y_scaled,

      contactParameter:
        parameter,
    });


  return Object.freeze({
    kind:
      SEGMENT_CONTACT_POINT_KIND_V1.POINT,

    x_coordinate:
      xCoordinate,

    y_coordinate:
      yCoordinate,
  });
}


module.exports = {
  SEGMENT_CONTACT_POINT_KIND_V1,
  createAffineContactCoordinateV1,
  createSegmentContactPointV1,
};
