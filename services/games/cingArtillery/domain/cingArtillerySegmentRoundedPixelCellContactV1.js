"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SEGMENT VS ROUNDED PIXEL CELL CONTACT V1
 *
 * Exact deterministic BigInt contact predicate for:
 *
 *   projectile center motion segment
 *           vs
 *   closed pixel cell expanded by projectile radius
 *
 * The Minkowski-expanded pixel cell is a rounded rectangle:
 *
 *   center horizontal strip
 *   center vertical strip
 *   four radius corner circles
 *
 * IMPORTANT:
 *
 * A plain expanded AABB is NOT geometrically exact.
 * Its four square corner regions exceed the true rounded
 * Minkowski boundary and would create false positives.
 *
 * Exact tangent contact counts as contact.
 *
 * No:
 *   floating point
 *   sqrt
 *   substeps
 *   approximation
 *   bitmask lookup
 *   map bounds
 *   TOI
 *   impact point
 *   collision precedence
 *   DB
 *   realtime
 */

const {
  segmentIntersectsCircleV1,
} =
  require(
    "./cingArtillerySegmentCircleContactV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_SEGMENT_ROUNDED_PIXEL_CELL_CONTACT_V1",
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
        `Segment/rounded-cell Cing Artillery không hợp lệ: ${field}`,
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
        `Segment/rounded-cell Cing Artillery yêu cầu ${field} > 0`,
    });
  }

  return normalized;
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
    value <= 0
  ) {
    throw buildError({
      message:
        `Segment/rounded-cell Cing Artillery không hợp lệ: ${field}`,
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


function segmentIntersectsClosedAabbV1({
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
        "Segment/rounded-cell Cing Artillery có AABB không hợp lệ",
    });
  }


  if (
    pointInsideClosedAabb({
      x: ax,
      y: ay,
      minX: x0,
      minY: y0,
      maxX: x1,
      maxY: y1,
    }) ||
    pointInsideClosedAabb({
      x: bx,
      y: by,
      minX: x0,
      minY: y0,
      maxX: x1,
      maxY: y1,
    })
  ) {
    return true;
  }


  const dx =
    bx - ax;

  const dy =
    by - ay;


  if (
    dx === 0n &&
    dy === 0n
  ) {
    return false;
  }


  /*
   * Exact rational slab intersection.
   *
   * t is never materialized as floating point.
   * Bounds are represented as fractions numerator/denominator
   * with positive denominators and compared by cross product.
   */

  let lowerNum =
    0n;

  let lowerDen =
    1n;

  let upperNum =
    1n;

  let upperDen =
    1n;


  function tightenAxis({
    start,
    delta,
    slabMin,
    slabMax,
  }) {
    if (
      delta === 0n
    ) {
      return (
        start >= slabMin &&
        start <= slabMax
      );
    }


    let enterNum =
      slabMin - start;

    let exitNum =
      slabMax - start;

    let den =
      delta;


    if (
      den < 0n
    ) {
      den =
        -den;

      enterNum =
        -enterNum;

      exitNum =
        -exitNum;

      const temp =
        enterNum;

      enterNum =
        exitNum;

      exitNum =
        temp;
    }


    if (
      enterNum *
        lowerDen >
      lowerNum *
        den
    ) {
      lowerNum =
        enterNum;

      lowerDen =
        den;
    }


    if (
      exitNum *
        upperDen <
      upperNum *
        den
    ) {
      upperNum =
        exitNum;

      upperDen =
        den;
    }


    return (
      lowerNum *
        upperDen <=
      upperNum *
        lowerDen
    );
  }


  if (
    !tightenAxis({
      start:
        ax,

      delta:
        dx,

      slabMin:
        x0,

      slabMax:
        x1,
    })
  ) {
    return false;
  }


  if (
    !tightenAxis({
      start:
        ay,

      delta:
        dy,

      slabMin:
        y0,

      slabMax:
        y1,
    })
  ) {
    return false;
  }


  return (
    lowerNum *
      upperDen <=
    upperNum *
      lowerDen
  );
}


function segmentIntersectsRoundedPixelCellV1({
  startXScaled,
  startYScaled,
  endXScaled,
  endYScaled,

  radiusScaled,

  cellX,
  cellY,

  physicsFixedScale,
}) {
  const startX =
    assertBigInt(
      startXScaled,
      "start_x_scaled"
    );

  const startY =
    assertBigInt(
      startYScaled,
      "start_y_scaled"
    );

  const endX =
    assertBigInt(
      endXScaled,
      "end_x_scaled"
    );

  const endY =
    assertBigInt(
      endYScaled,
      "end_y_scaled"
    );

  const radius =
    assertPositiveBigInt(
      radiusScaled,
      "radius_scaled"
    );

  const x =
    assertBigInt(
      cellX,
      "cell_x"
    );

  const y =
    assertBigInt(
      cellY,
      "cell_y"
    );

  const scale =
    BigInt(
      assertPositiveSafeInteger(
        physicsFixedScale,
        "physics_fixed_scale"
      )
    );


  const minX =
    x *
    scale;

  const minY =
    y *
    scale;

  const maxX =
    (x + 1n) *
    scale;

  const maxY =
    (y + 1n) *
    scale;


  /*
   * Horizontal strip:
   *
   * [minX, maxX]
   * ×
   * [minY-radius, maxY+radius]
   */
  if (
    segmentIntersectsClosedAabbV1({
      startX,
      startY,
      endX,
      endY,

      minX,
      minY:
        minY -
        radius,

      maxX,
      maxY:
        maxY +
        radius,
    })
  ) {
    return true;
  }


  /*
   * Vertical strip:
   *
   * [minX-radius, maxX+radius]
   * ×
   * [minY, maxY]
   */
  if (
    segmentIntersectsClosedAabbV1({
      startX,
      startY,
      endX,
      endY,

      minX:
        minX -
        radius,

      minY,

      maxX:
        maxX +
        radius,

      maxY,
    })
  ) {
    return true;
  }


  const corners = [
    [minX, minY],
    [maxX, minY],
    [minX, maxY],
    [maxX, maxY],
  ];


  for (
    const [
      cornerX,
      cornerY,
    ]
    of corners
  ) {
    if (
      segmentIntersectsCircleV1({
        startX,
        startY,
        endX,
        endY,

        circleX:
          cornerX,

        circleY:
          cornerY,

        radius,
      })
    ) {
      return true;
    }
  }


  return false;
}


module.exports = {
  segmentIntersectsClosedAabbV1,
  segmentIntersectsRoundedPixelCellV1,
};
