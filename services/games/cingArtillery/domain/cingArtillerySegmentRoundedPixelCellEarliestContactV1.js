"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SEGMENT VS ROUNDED PIXEL CELL EARLIEST CONTACT V1
 *
 * Exact deterministic earliest contact parameter for:
 *
 *   projectile center motion segment
 *           vs
 *   one closed pixel cell expanded by projectile radius
 *
 * Exact Minkowski geometry is the union of:
 *
 *   1. horizontal closed strip
 *   2. vertical closed strip
 *   3. top-left corner circle
 *   4. top-right corner circle
 *   5. bottom-left corner circle
 *   6. bottom-right corner circle
 *
 * Each component returns:
 *
 *   null | ContactParameterV1
 *
 * The exact comparator chooses the minimum canonical
 * parameter across all non-null candidates.
 *
 * Therefore this authority can compare:
 *
 *   rational AABB entry
 *
 * against:
 *
 *   rational or irrational quadratic circle entry
 *
 * without floating point or approximation.
 *
 * The already-locked rounded-cell boolean authority remains
 * the contact-existence/nullability oracle.
 *
 * This module owns ONLY earliest contact against ONE rounded
 * pixel cell.
 *
 * It does NOT:
 *
 *   scan terrain
 *   inspect bitmasks
 *   choose between multiple terrain cells
 *   decide player/terrain precedence
 *   classify out_of_bounds
 *   calculate impact coordinates
 *   calculate damage
 *   mutate gameplay
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  segmentIntersectsRoundedPixelCellV1,
} =
  require(
    "./cingArtillerySegmentRoundedPixelCellContactV1"
  );

const {
  segmentClosedAabbEarliestContactParameterV1,
} =
  require(
    "./cingArtillerySegmentClosedAabbEarliestContactParameterV1"
  );

const {
  segmentCircleEarliestContactParameterV1,
} =
  require(
    "./cingArtillerySegmentCircleEarliestContactParameterV1"
  );

const {
  compareContactParametersV1,
} =
  require(
    "./cingArtilleryContactParameterComparatorV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_SEGMENT_ROUNDED_PIXEL_CELL_EARLIEST_CONTACT_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function selectEarlierContact(
  current,
  candidate
) {
  if (
    candidate === null
  ) {
    return current;
  }

  if (
    current === null
  ) {
    return candidate;
  }

  return (
    compareContactParametersV1(
      candidate,
      current
    ) < 0
  )
    ? candidate
    : current;
}


function segmentRoundedPixelCellEarliestContactV1({
  startXScaled,
  startYScaled,
  endXScaled,
  endYScaled,

  radiusScaled,

  cellX,
  cellY,

  physicsFixedScale,
}) {
  const input = {
    startXScaled,
    startYScaled,
    endXScaled,
    endYScaled,

    radiusScaled,

    cellX,
    cellY,

    physicsFixedScale,
  };


  /*
   * The locked boolean rounded-cell primitive performs the
   * canonical input validation and remains authoritative
   * for contact existence.
   */
  if (
    !segmentIntersectsRoundedPixelCellV1(
      input
    )
  ) {
    return null;
  }


  /*
   * Inputs have been validated by the boolean authority.
   *
   * The scale conversion below therefore cannot observe an
   * invalid Number or unsafe integer.
   */
  const scale =
    BigInt(
      physicsFixedScale
    );

  const minX =
    cellX *
    scale;

  const minY =
    cellY *
    scale;

  const maxX =
    (cellX + 1n) *
    scale;

  const maxY =
    (cellY + 1n) *
    scale;


  let earliest =
    null;


  /*
   * Candidate 1:
   *
   * horizontal strip
   *
   * [minX,maxX]
   * ×
   * [minY-radius,maxY+radius]
   */
  earliest =
    selectEarlierContact(
      earliest,
      segmentClosedAabbEarliestContactParameterV1({
        startX:
          startXScaled,

        startY:
          startYScaled,

        endX:
          endXScaled,

        endY:
          endYScaled,

        minX,

        minY:
          minY -
          radiusScaled,

        maxX,

        maxY:
          maxY +
          radiusScaled,
      })
    );


  /*
   * Candidate 2:
   *
   * vertical strip
   *
   * [minX-radius,maxX+radius]
   * ×
   * [minY,maxY]
   */
  earliest =
    selectEarlierContact(
      earliest,
      segmentClosedAabbEarliestContactParameterV1({
        startX:
          startXScaled,

        startY:
          startYScaled,

        endX:
          endXScaled,

        endY:
          endYScaled,

        minX:
          minX -
          radiusScaled,

        minY,

        maxX:
          maxX +
          radiusScaled,

        maxY,
      })
    );


  const corners = [
    Object.freeze({
      x:
        minX,

      y:
        minY,
    }),

    Object.freeze({
      x:
        maxX,

      y:
        minY,
    }),

    Object.freeze({
      x:
        minX,

      y:
        maxY,
    }),

    Object.freeze({
      x:
        maxX,

      y:
        maxY,
    }),
  ];


  /*
   * Candidates 3..6:
   *
   * four exact corner circles.
   */
  for (
    const corner
    of corners
  ) {
    earliest =
      selectEarlierContact(
        earliest,
        segmentCircleEarliestContactParameterV1({
          startX:
            startXScaled,

          startY:
            startYScaled,

          endX:
            endXScaled,

          endY:
            endYScaled,

          circleX:
            corner.x,

          circleY:
            corner.y,

          radius:
            radiusScaled,
        })
      );
  }


  /*
   * The boolean authority already proved contact.
   *
   * At least one exact component candidate must therefore
   * exist. Anything else indicates disagreement between
   * locked boolean union semantics and parameter semantics.
   */
  if (
    earliest === null
  ) {
    throw buildError({
      message:
        "Segment/rounded-cell earliest contact Cing Artillery vi phạm six-component union invariant",
      code:
        "CING_ARTILLERY_ROUNDED_PIXEL_CELL_CONTACT_INVARIANT_V1",
    });
  }


  return earliest;
}


module.exports = {
  segmentRoundedPixelCellEarliestContactV1,
};
