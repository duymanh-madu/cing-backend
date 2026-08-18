"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SEGMENT VS CLOSED AABB EXIT CONTACT PARAMETER V1
 *
 * Exact deterministic EXIT boundary parameter for:
 *
 *   closed line segment AB
 *          from a start point inside/on
 *          a closed axis-aligned bounding box
 *
 * Return:
 *
 *   null
 *
 * when the segment does not leave the closed AABB,
 *
 * or canonical rational ContactParameterV1:
 *
 *   0 <= t <= 1
 *
 * representing the exact upper slab boundary:
 *
 *   P(t) = A + t(B - A)
 *
 * -------------------------------------------------------
 * SEMANTICS
 * -------------------------------------------------------
 *
 * start strictly inside + end inside/on
 *   -> null
 *
 * start strictly inside + end outside
 *   -> exact exit boundary parameter
 *
 * start on boundary + move inward/along boundary
 *   -> null unless the segment later exits
 *
 * start on boundary + move outward
 *   -> 0/1
 *
 * stationary inside/on
 *   -> null
 *
 * start outside
 *   -> invalid for this primitive
 *
 * AABB exit boundaries are linear in t, therefore every
 * materialized exit parameter is rational.
 *
 * This is a generic geometry primitive.
 *
 * It does NOT:
 *
 *   define map/world semantics
 *   apply projectile radius
 *   classify gameplay out_of_bounds
 *   inspect terrain
 *   inspect players
 *   decide collision precedence
 *   calculate impact coordinates
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  createRationalContactParameterV1,
} =
  require(
    "./cingArtilleryContactParameterV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_SEGMENT_CLOSED_AABB_EXIT_CONTACT_V1",
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
        `Segment/closed-AABB exit Cing Artillery không hợp lệ: ${field}`,
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


function segmentClosedAabbExitContactParameterV1({
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
        "Segment/closed-AABB exit Cing Artillery có AABB không hợp lệ",
    });
  }


  if (
    !pointInsideClosedAabb({
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
    throw buildError({
      message:
        "Segment/closed-AABB exit Cing Artillery yêu cầu start nằm trong hoặc trên closed AABB",
      code:
        "CING_ARTILLERY_SEGMENT_CLOSED_AABB_EXIT_START_OUTSIDE_V1",
    });
  }


  if (
    pointInsideClosedAabb({
      x:
        bx,

      y:
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
   * Start is inside/on while end is outside.
   *
   * Therefore a stationary segment is impossible here.
   */
  if (
    dx === 0n &&
    dy === 0n
  ) {
    throw buildError({
      message:
        "Segment/closed-AABB exit Cing Artillery vi phạm stationary-exit invariant",
      code:
        "CING_ARTILLERY_SEGMENT_CLOSED_AABB_EXIT_INVARIANT_V1",
    });
  }


  /*
   * Closed segment upper bound begins at t=1.
   *
   * Each non-parallel slab provides an exit fraction.
   * The exact AABB exit is the MINIMUM upper bound.
   *
   * All denominators remain positive.
   */
  let upperNum =
    1n;

  let upperDen =
    1n;


  function tightenUpperAxis({
    start,
    delta,
    slabMin,
    slabMax,
  }) {
    if (
      delta === 0n
    ) {
      /*
       * Start is already known inside/on the AABB.
       * Parallel motion cannot leave through this axis.
       */
      return;
    }


    let exitNum;
    let den;


    if (
      delta > 0n
    ) {
      exitNum =
        slabMax -
        start;

      den =
        delta;
    } else {
      /*
       * Moving negative exits through slabMin.
       *
       * Normalize denominator positive:
       *
       *   (slabMin-start) / delta
       *
       * becomes:
       *
       *   (start-slabMin) / (-delta)
       */
      exitNum =
        start -
        slabMin;

      den =
        -delta;
    }


    if (
      compareFractions({
        leftNum:
          exitNum,

        leftDen:
          den,

        rightNum:
          upperNum,

        rightDen:
          upperDen,
      }) < 0
    ) {
      upperNum =
        exitNum;

      upperDen =
        den;
    }
  }


  tightenUpperAxis({
    start:
      ax,

    delta:
      dx,

    slabMin:
      x0,

    slabMax:
      x1,
  });


  tightenUpperAxis({
    start:
      ay,

    delta:
      dy,

    slabMin:
      y0,

    slabMax:
      y1,
  });


  try {
    return createRationalContactParameterV1({
      numerator:
        upperNum,

      denominator:
        upperDen,
    });
  } catch (error) {
    throw buildError({
      message:
        "Segment/closed-AABB exit Cing Artillery tạo upper slab bound ngoài canonical segment",
      code:
        "CING_ARTILLERY_SEGMENT_CLOSED_AABB_EXIT_INVARIANT_V1",
    });
  }
}


module.exports = {
  segmentClosedAabbExitContactParameterV1,
};
