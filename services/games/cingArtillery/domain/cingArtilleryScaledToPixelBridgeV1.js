"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SCALED-TO-PIXEL COLLISION BRIDGE V1
 *
 * Canonical spatial semantics:
 *
 *   map-local integer pixel cells
 *   origin top-left
 *   +X = right
 *   +Y = down
 *
 * A pixel cell owns:
 *
 *   pixel  0 => [ 0, 1)
 *   pixel  1 => [ 1, 2)
 *   pixel -1 => [-1, 0)
 *
 * Therefore scaled coordinate -> owning pixel MUST use
 * mathematical floor.
 *
 * It MUST NOT use:
 *
 *   BigInt truncation toward zero
 *   trajectory signed-magnitude quantization
 *
 * Safety boundary:
 *
 *   owning cells remain BigInt until map bounds have been
 *   checked in BigInt space.
 *
 *   Only an in-bounds pixel may be converted to Number.
 *
 * This module owns only:
 *
 *   scaled coordinate -> owning pixel cell
 *   map-cell bounds projection
 *   safe in-bounds BigInt -> Number conversion
 *
 * It does NOT:
 *
 *   inspect terrain
 *   inspect bitmasks
 *   apply projectile radius
 *   derive player colliders
 *   classify gameplay out_of_bounds
 *   classify terrain_hit / player_hit
 *   determine collision precedence
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


const POSTGRES_INTEGER_MAX =
  2147483647;


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_SCALED_TO_PIXEL_BRIDGE_V1",
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
        `Scaled-to-pixel bridge Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
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
        `Scaled-to-pixel bridge Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function assertMapDimension(
  value,
  field
) {
  const dimension =
    assertPositiveSafeInteger(
      value,
      field
    );

  if (
    dimension >
    POSTGRES_INTEGER_MAX
  ) {
    throw buildError({
      message:
        `Scaled-to-pixel bridge Cing Artillery vượt PostgreSQL integer map dimension: ${field}`,
      code:
        "CING_ARTILLERY_SCALED_TO_PIXEL_MAP_DIMENSION_OUT_OF_RANGE",
    });
  }

  return dimension;
}


function scaledCoordinateToOwningPixelCellV1({
  coordinateScaled,
  physicsFixedScale,
}) {
  const coordinate =
    assertBigInt(
      coordinateScaled,
      "coordinate_scaled"
    );

  const scale =
    assertPositiveSafeInteger(
      physicsFixedScale,
      "physics_fixed_scale"
    );

  return floorDivBigInt(
    coordinate,
    BigInt(scale)
  );
}


function projectScaledPointToMapPixelV1({
  xScaled,
  yScaled,
  physicsFixedScale,
  widthPx,
  heightPx,
}) {
  const width =
    assertMapDimension(
      widthPx,
      "width_px"
    );

  const height =
    assertMapDimension(
      heightPx,
      "height_px"
    );

  const xCell =
    scaledCoordinateToOwningPixelCellV1({
      coordinateScaled:
        xScaled,

      physicsFixedScale,
    });

  const yCell =
    scaledCoordinateToOwningPixelCellV1({
      coordinateScaled:
        yScaled,

      physicsFixedScale,
    });

  const widthBigInt =
    BigInt(
      width
    );

  const heightBigInt =
    BigInt(
      height
    );

  const inBounds =
    xCell >= 0n &&
    yCell >= 0n &&
    xCell < widthBigInt &&
    yCell < heightBigInt;


  if (!inBounds) {
    return Object.freeze({
      in_bounds:
        false,

      x_cell:
        xCell,

      y_cell:
        yCell,

      x_px:
        null,

      y_px:
        null,
    });
  }


  /*
   * Conversion is safe only here:
   *
   *   0 <= xCell < widthPx <= PG int max
   *   0 <= yCell < heightPx <= PG int max
   *
   * Therefore both values are exact ECMAScript Numbers.
   */
  const xPx =
    Number(
      xCell
    );

  const yPx =
    Number(
      yCell
    );


  if (
    !Number.isSafeInteger(
      xPx
    ) ||
    !Number.isSafeInteger(
      yPx
    )
  ) {
    throw buildError({
      message:
        "Scaled-to-pixel bridge Cing Artillery không thể project in-bounds cell an toàn",
      code:
        "CING_ARTILLERY_SCALED_TO_PIXEL_UNSAFE_NUMBER_PROJECTION",
    });
  }


  return Object.freeze({
    in_bounds:
      true,

    x_cell:
      xCell,

    y_cell:
      yCell,

    x_px:
      xPx,

    y_px:
      yPx,
  });
}


module.exports = {
  POSTGRES_INTEGER_MAX,

  scaledCoordinateToOwningPixelCellV1,
  projectScaledPointToMapPixelV1,
};
