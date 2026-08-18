"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SEGMENT VS CIRCLE CONTACT V1
 *
 * Exact deterministic BigInt predicate for:
 *
 *   closed line segment AB
 *          vs
 *   closed circle C(radius)
 *
 * Canonical semantics:
 *
 *   exact tangent = contact
 *
 * No sqrt is required.
 * No division is required.
 * No floating-point arithmetic is permitted.
 *
 * Let:
 *
 *   D = B - A
 *   W = C - A
 *
 *   length_squared = D · D
 *   projection     = W · D
 *
 * When the closest point lies in the segment interior:
 *
 *   distance(C, line AB)^2
 *
 * can be compared exactly by:
 *
 *   cross(D, W)^2
 *      <=
 *   radius^2 * length_squared
 *
 * without ever dividing by length_squared.
 *
 * This module owns ONLY pure segment/circle geometry.
 *
 * It does NOT:
 *
 *   know projectile semantics
 *   know player semantics
 *   inspect terrain
 *   inspect bitmasks
 *   classify map bounds
 *   classify gameplay out_of_bounds
 *   calculate time of impact
 *   calculate an impact point
 *   choose earliest collision
 *   decide terrain/player precedence
 *   sample trajectory
 *   mutate gameplay
 *   access PostgreSQL
 *   access realtime transport
 */


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_SEGMENT_CIRCLE_CONTACT_V1",
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
        `Segment/circle contact Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function assertPositiveBigInt(
  value,
  field
) {
  const normalized =
    assertBigInt(
      value,
      field
    );

  if (
    normalized <= 0n
  ) {
    throw buildError({
      message:
        `Segment/circle contact Cing Artillery yêu cầu ${field} > 0`,
    });
  }

  return normalized;
}


function squaredDistance(
  ax,
  ay,
  bx,
  by
) {
  const dx =
    ax - bx;

  const dy =
    ay - by;

  return (
    dx * dx +
    dy * dy
  );
}


function segmentIntersectsCircleV1({
  startX,
  startY,
  endX,
  endY,

  circleX,
  circleY,
  radius,
}) {
  const ax =
    assertBigInt(
      startX,
      "start_x"
    );

  const ay =
    assertBigInt(
      startY,
      "start_y"
    );

  const bx =
    assertBigInt(
      endX,
      "end_x"
    );

  const by =
    assertBigInt(
      endY,
      "end_y"
    );

  const cx =
    assertBigInt(
      circleX,
      "circle_x"
    );

  const cy =
    assertBigInt(
      circleY,
      "circle_y"
    );

  const r =
    assertPositiveBigInt(
      radius,
      "radius"
    );

  const radiusSquared =
    r * r;


  if (
    squaredDistance(
      ax,
      ay,
      cx,
      cy
    ) <=
    radiusSquared
  ) {
    return true;
  }


  if (
    squaredDistance(
      bx,
      by,
      cx,
      cy
    ) <=
    radiusSquared
  ) {
    return true;
  }


  const dx =
    bx - ax;

  const dy =
    by - ay;

  const lengthSquared =
    dx * dx +
    dy * dy;


  /*
   * Stationary segment.
   *
   * Both endpoint checks already failed, therefore
   * there is no circle contact.
   */
  if (
    lengthSquared === 0n
  ) {
    return false;
  }


  const wx =
    cx - ax;

  const wy =
    cy - ay;

  const projection =
    wx * dx +
    wy * dy;


  /*
   * Closest point is A or lies behind A.
   * Endpoint A was already tested.
   */
  if (
    projection <= 0n
  ) {
    return false;
  }


  /*
   * Closest point is B or lies beyond B.
   * Endpoint B was already tested.
   */
  if (
    projection >=
    lengthSquared
  ) {
    return false;
  }


  const cross =
    dx * wy -
    dy * wx;


  return (
    cross * cross <=
    radiusSquared *
      lengthSquared
  );
}


module.exports = {
  segmentIntersectsCircleV1,
};
