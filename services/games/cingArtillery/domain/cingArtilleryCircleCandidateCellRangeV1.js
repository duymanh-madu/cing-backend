"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * CIRCLE CANDIDATE CELL RANGE V1
 *
 * Broad-phase candidate range for instantaneous
 * circle-vs-pixel-cell collision.
 *
 * Canonical distinction:
 *
 * Point ownership:
 *
 *   pixel x owns [x, x + 1)
 *
 * Collision geometry:
 *
 *   pixel x occupies closed interval [x, x + 1]
 *
 * Therefore exact circle tangent at an integer cell boundary
 * must include BOTH adjacent cells as candidates.
 *
 * Let:
 *
 *   low  = center - radius
 *   high = center + radius
 *
 * on the exact integer fixed-point lattice.
 *
 * Candidate cells are:
 *
 *   min_cell =
 *     floor((low - 1 scaled lattice unit) / scale)
 *
 *   max_cell =
 *     floor(high / scale)
 *
 * The "-1" is NOT a floating epsilon.
 * It is exactly one representable fixed-point lattice unit.
 *
 * Example:
 *
 *   scale  = 1000
 *   low    = 1000
 *
 * Circle reaches exactly x = 1px.
 *
 * Both:
 *
 *   cell 0 => [0, 1]
 *   cell 1 => [1, 2]
 *
 * participate in closed collision geometry.
 *
 * Therefore min_cell = 0.
 *
 * This module owns ONLY unbounded BigInt broad-phase range
 * derivation.
 *
 * It does NOT:
 *
 *   know map width/height
 *   clip to map bounds
 *   convert cells to Number
 *   inspect collision masks
 *   inspect terrain
 *   perform narrow-phase circle/cell contact
 *   classify out_of_bounds
 *   sample trajectory
 *   perform swept collision
 *   determine collision precedence
 *   produce shot-resolution outcomes
 *   mutate gameplay
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  floorDivBigInt,
} =
  require(
    "./cingArtilleryFixedPoint"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_CIRCLE_CANDIDATE_CELL_RANGE_V1",
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
        `Circle candidate range Cing Artillery không hợp lệ: ${field}`,
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
        `Circle candidate range Cing Artillery yêu cầu ${field} > 0`,
    });
  }

  return normalized;
}


function assertPhysicsFixedScale(
  value
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
        "Circle candidate range Cing Artillery có physics_fixed_scale không hợp lệ",
    });
  }

  return value;
}


function deriveAxisCandidateCellRangeV1({
  centerScaled,
  radiusScaled,
  physicsFixedScale,
}) {
  const center =
    assertBigInt(
      centerScaled,
      "center_scaled"
    );

  const radius =
    assertPositiveBigInt(
      radiusScaled,
      "radius_scaled"
    );

  const scale =
    BigInt(
      assertPhysicsFixedScale(
        physicsFixedScale
      )
    );

  const low =
    center -
    radius;

  const high =
    center +
    radius;

  const minCell =
    floorDivBigInt(
      low - 1n,
      scale
    );

  const maxCell =
    floorDivBigInt(
      high,
      scale
    );

  return Object.freeze({
    min_cell:
      minCell,

    max_cell:
      maxCell,
  });
}


function deriveCircleCandidateCellRangeV1({
  centerXScaled,
  centerYScaled,
  radiusScaled,
  physicsFixedScale,
}) {
  const radius =
    assertPositiveBigInt(
      radiusScaled,
      "radius_scaled"
    );

  const xRange =
    deriveAxisCandidateCellRangeV1({
      centerScaled:
        centerXScaled,

      radiusScaled:
        radius,

      physicsFixedScale,
    });

  const yRange =
    deriveAxisCandidateCellRangeV1({
      centerScaled:
        centerYScaled,

      radiusScaled:
        radius,

      physicsFixedScale,
    });

  return Object.freeze({
    min_x_cell:
      xRange.min_cell,

    max_x_cell:
      xRange.max_cell,

    min_y_cell:
      yRange.min_cell,

    max_y_cell:
      yRange.max_cell,
  });
}


module.exports = {
  deriveAxisCandidateCellRangeV1,
  deriveCircleCandidateCellRangeV1,
};
