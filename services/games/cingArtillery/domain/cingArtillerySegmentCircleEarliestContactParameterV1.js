"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SEGMENT VS CIRCLE EARLIEST CONTACT PARAMETER V1
 *
 * Exact deterministic earliest contact parameter for:
 *
 *   closed line segment AB
 *          vs
 *   closed circle C(radius)
 *
 * Return:
 *
 *   null
 *
 * or canonical ContactParameterV1 representing:
 *
 *   0 <= t <= 1
 *
 * along:
 *
 *   P(t) = A + t(B - A)
 *
 * Canonical semantics:
 *
 *   start inside/tangent -> t = 0
 *   tangent contact       -> contact
 *   no contact            -> null
 *
 * For a start point outside the circle:
 *
 *   Acoef t² + Bcoef t + Ccoef = 0
 *
 * where:
 *
 *   D = B - A
 *   F = A - C
 *
 *   Acoef = D · D
 *   Bcoef = 2(D · F)
 *   Ccoef = F · F - r²
 *
 * Earliest contact is the lower quadratic root:
 *
 *   (-Bcoef - sqrt(discriminant)) / (2*Acoef)
 *
 * ContactParameterV1 owns exact algebraic representation
 * and perfect-square -> rational canonicalization.
 *
 * This module owns ONLY earliest segment/circle contact
 * parameter extraction.
 *
 * It does NOT:
 *
 *   know projectile/player semantics
 *   inspect terrain
 *   inspect bitmasks
 *   choose terrain/player precedence
 *   calculate impact coordinates
 *   sample trajectory
 *   mutate gameplay
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  segmentIntersectsCircleV1,
} =
  require(
    "./cingArtillerySegmentCircleContactV1"
  );

const {
  createRationalContactParameterV1,
  createQuadraticLowerRootContactParameterV1,
} =
  require(
    "./cingArtilleryContactParameterV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_SEGMENT_CIRCLE_EARLIEST_CONTACT_PARAMETER_V1",
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
        `Segment/circle earliest contact Cing Artillery không hợp lệ: ${field}`,
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
        `Segment/circle earliest contact Cing Artillery yêu cầu ${field} > 0`,
    });
  }

  return normalized;
}


function squaredDistance({
  ax,
  ay,
  bx,
  by,
}) {
  const dx =
    ax - bx;

  const dy =
    ay - by;

  return (
    dx * dx +
    dy * dy
  );
}


function segmentCircleEarliestContactParameterV1({
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
    r *
    r;


  /*
   * Closed-circle semantics.
   *
   * If the segment begins inside or exactly tangent,
   * earliest contact is the segment start.
   */
  if (
    squaredDistance({
      ax,
      ay,
      bx:
        cx,

      by:
        cy,
    }) <=
    radiusSquared
  ) {
    return createRationalContactParameterV1({
      numerator:
        0n,

      denominator:
        1n,
    });
  }


  /*
   * Reuse the already-locked exact boolean authority to
   * reject every no-contact geometry before materializing
   * an algebraic root.
   */
  if (
    !segmentIntersectsCircleV1({
      startX:
        ax,

      startY:
        ay,

      endX:
        bx,

      endY:
        by,

      circleX:
        cx,

      circleY:
        cy,

      radius:
        r,
    })
  ) {
    return null;
  }


  const dx =
    bx -
    ax;

  const dy =
    by -
    ay;


  const coefficientA =
    dx * dx +
    dy * dy;


  /*
   * A stationary segment whose start was outside cannot
   * reach the circle. The boolean authority above would
   * already have returned false.
   *
   * Keep this invariant explicit and fail closed if the
   * dependency contract is ever violated.
   */
  if (
    coefficientA === 0n
  ) {
    throw buildError({
      message:
        "Segment/circle earliest contact Cing Artillery gặp stationary-contact invariant không hợp lệ",
      code:
        "CING_ARTILLERY_SEGMENT_CIRCLE_CONTACT_INVARIANT_V1",
    });
  }


  const fx =
    ax -
    cx;

  const fy =
    ay -
    cy;


  const coefficientB =
    2n *
    (
      dx *
        fx +
      dy *
        fy
    );


  const coefficientC =
    fx *
      fx +
    fy *
      fy -
    radiusSquared;


  /*
   * Start point was already proven strictly outside.
   */
  if (
    coefficientC <= 0n
  ) {
    throw buildError({
      message:
        "Segment/circle earliest contact Cing Artillery vi phạm start-outside invariant",
      code:
        "CING_ARTILLERY_SEGMENT_CIRCLE_CONTACT_INVARIANT_V1",
    });
  }


  const discriminant =
    coefficientB *
      coefficientB -
    4n *
      coefficientA *
      coefficientC;


  /*
   * Exact boolean contact plus start-outside semantics
   * guarantee a real entry root.
   */
  if (
    discriminant < 0n
  ) {
    throw buildError({
      message:
        "Segment/circle earliest contact Cing Artillery vi phạm discriminant invariant",
      code:
        "CING_ARTILLERY_SEGMENT_CIRCLE_CONTACT_INVARIANT_V1",
    });
  }


  try {
    return createQuadraticLowerRootContactParameterV1({
      a:
        coefficientA,

      b:
        coefficientB,

      discriminant,
    });
  } catch (error) {
    throw buildError({
      message:
        "Segment/circle earliest contact Cing Artillery tạo lower-root ngoài segment sau khi contact đã được chứng minh",
      code:
        "CING_ARTILLERY_SEGMENT_CIRCLE_CONTACT_INVARIANT_V1",
    });
  }
}


module.exports = {
  segmentCircleEarliestContactParameterV1,
};
