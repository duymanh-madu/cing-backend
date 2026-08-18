"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SEGMENT VS CLOSED AABB EARLIEST CONTACT PARAMETER V1
 *
 * Exact deterministic earliest contact parameter for:
 *
 *   closed line segment AB
 *          vs
 *   closed axis-aligned bounding box
 *
 * Return:
 *
 *   null
 *
 * or canonical rational ContactParameterV1:
 *
 *   0 <= t <= 1
 *
 * along:
 *
 *   P(t) = A + t(B - A)
 *
 * Closed-boundary semantics:
 *
 *   start inside/on boundary -> t = 0
 *   endpoint-only contact    -> t = 1
 *   tangent/corner contact   -> contact
 *
 * AABB slab boundaries are linear in t, therefore the
 * earliest contact parameter is always rational.
 *
 * The already-locked boolean AABB primitive remains the
 * authority for contact existence/nullability.
 *
 * This module materializes only the exact lower slab bound
 * after contact existence has been proven.
 *
 * No:
 *   floating point
 *   division
 *   approximation
 *   circle geometry
 *   rounded-cell precedence
 *   terrain lookup
 *   impact coordinates
 *   DB
 *   realtime
 */

const {
  segmentIntersectsClosedAabbV1,
} =
  require(
    "./cingArtillerySegmentRoundedPixelCellContactV1"
  );

const {
  createRationalContactParameterV1,
} =
  require(
    "./cingArtilleryContactParameterV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_SEGMENT_CLOSED_AABB_EARLIEST_CONTACT_V1",
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
        `Segment/closed-AABB earliest contact Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function pointInsideClosedAabb({
  x,
  y,
  minX,
  minY,
  maxX,
  maxY,
}) {
  return (
    x >= minX &&
    x <= maxX &&
    y >= minY &&
    y <= maxY
  );
}


function compareFractions({
  leftNum,
  leftDen,
  rightNum,
  rightDen,
}) {
  const left =
    leftNum *
    rightDen;

  const right =
    rightNum *
    leftDen;

  if (
    left < right
  ) {
    return -1;
  }

  if (
    left > right
  ) {
    return 1;
  }

  return 0;
}


function segmentClosedAabbEarliestContactParameterV1({
  startX,
  startY,
  endX,
  endY,
  minX,
  minY,
  maxX,
  maxY,
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

  const x0 =
    assertBigInt(
      minX,
      "min_x"
    );

  const y0 =
    assertBigInt(
      minY,
      "min_y"
    );

  const x1 =
    assertBigInt(
      maxX,
      "max_x"
    );

  const y1 =
    assertBigInt(
      maxY,
      "max_y"
    );


  if (
    x0 > x1 ||
    y0 > y1
  ) {
    throw buildError({
      message:
        "Segment/closed-AABB earliest contact Cing Artillery có AABB không hợp lệ",
    });
  }


  if (
    pointInsideClosedAabb({
      x:
        ax,

      y:
        ay,

      minX:
        x0,

      minY:
        y0,

      maxX:
        x1,

      maxY:
        y1,
    })
  ) {
    return createRationalContactParameterV1({
      numerator:
        0n,

      denominator:
        1n,
    });
  }


  /*
   * Preserve the already-locked closed-AABB contact
   * semantics as the existence/nullability authority.
   */
  if (
    !segmentIntersectsClosedAabbV1({
      startX:
        ax,

      startY:
        ay,

      endX:
        bx,

      endY:
        by,

      minX:
        x0,

      minY:
        y0,

      maxX:
        x1,

      maxY:
        y1,
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


  /*
   * A stationary start outside cannot contact.
   * Boolean authority above must already have returned
   * false in that case.
   */
  if (
    dx === 0n &&
    dy === 0n
  ) {
    throw buildError({
      message:
        "Segment/closed-AABB earliest contact Cing Artillery vi phạm stationary-contact invariant",
      code:
        "CING_ARTILLERY_SEGMENT_CLOSED_AABB_CONTACT_INVARIANT_V1",
    });
  }


  /*
   * Start with the closed segment lower bound t=0.
   *
   * Every non-parallel axis can tighten this lower bound
   * using its slab-entry fraction.
   *
   * Fractions always retain positive denominators.
   */
  let lowerNum =
    0n;

  let lowerDen =
    1n;


  function tightenLowerAxis({
    start,
    delta,
    slabMin,
    slabMax,
  }) {
    if (
      delta === 0n
    ) {
      /*
       * Contact existence was already proven.
       * A parallel axis must therefore lie inside/on its
       * closed slab.
       */
      if (
        start < slabMin ||
        start > slabMax
      ) {
        throw buildError({
          message:
            "Segment/closed-AABB earliest contact Cing Artillery vi phạm parallel-slab invariant",
          code:
            "CING_ARTILLERY_SEGMENT_CLOSED_AABB_CONTACT_INVARIANT_V1",
        });
      }

      return;
    }


    let enterNum;
    let den;


    if (
      delta > 0n
    ) {
      enterNum =
        slabMin -
        start;

      den =
        delta;
    } else {
      /*
       * Moving in the negative axis direction enters
       * through slabMax.
       *
       * Normalize denominator positive:
       *
       *   (slabMax-start) / delta
       *
       * becomes:
       *
       *   (start-slabMax) / (-delta)
       */
      enterNum =
        start -
        slabMax;

      den =
        -delta;
    }


    if (
      compareFractions({
        leftNum:
          enterNum,

        leftDen:
          den,

        rightNum:
          lowerNum,

        rightDen:
          lowerDen,
      }) > 0
    ) {
      lowerNum =
        enterNum;

      lowerDen =
        den;
    }
  }


  tightenLowerAxis({
    start:
      ax,

    delta:
      dx,

    slabMin:
      x0,

    slabMax:
      x1,
  });


  tightenLowerAxis({
    start:
      ay,

    delta:
      dy,

    slabMin:
      y0,

    slabMax:
      y1,
  });


  /*
   * Because:
   *
   *   - start was outside,
   *   - contact existence was already proven,
   *   - t is clamped by initial lower bound 0,
   *
   * the materialized lower bound must lie in:
   *
   *   0 < t <= 1
   *
   * ContactParameterV1 performs the final canonical
   * [0,1] validation and rational reduction.
   */
  try {
    return createRationalContactParameterV1({
      numerator:
        lowerNum,

      denominator:
        lowerDen,
    });
  } catch (error) {
    throw buildError({
      message:
        "Segment/closed-AABB earliest contact Cing Artillery tạo lower slab bound ngoài segment sau khi contact đã được chứng minh",
      code:
        "CING_ARTILLERY_SEGMENT_CLOSED_AABB_CONTACT_INVARIANT_V1",
    });
  }
}


module.exports = {
  segmentClosedAabbEarliestContactParameterV1,
};
