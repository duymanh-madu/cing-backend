"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * MUZZLE GEOMETRY NUMERIC AUTHORITY V1
 *
 * Canonical world semantics:
 *
 *   character spawn = ground-contact anchor
 *   +X = right
 *   +Y = down
 *
 * This module owns only numeric canonicalization of:
 *
 *   muzzle_offset_forward_px
 *   muzzle_offset_up_px
 *
 * Both must be exactly representable on physics_fixed_scale.
 *
 * Invariants:
 *
 *   muzzle_offset_forward_px >= 0
 *   muzzle_offset_up_px > 0
 *
 * No implicit rounding.
 *
 * This module does NOT calculate muzzle origin.
 */

const {
  toScaledBigInt,
} =
  require(
    "./cingArtilleryFixedPoint"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_MUZZLE_GEOMETRY_NUMERIC_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    400;

  return error;
}


function normalizeMuzzleGeometryRulesV1({
  muzzleOffsetForwardPx,
  muzzleOffsetUpPx,
  physicsFixedScale,
}) {
  const forward =
    toScaledBigInt(
      muzzleOffsetForwardPx,
      physicsFixedScale,
      "muzzle_offset_forward_px"
    );

  const up =
    toScaledBigInt(
      muzzleOffsetUpPx,
      physicsFixedScale,
      "muzzle_offset_up_px"
    );


  if (forward < 0n) {
    throw buildError({
      message:
        "Muzzle geometry Cing Artillery yêu cầu muzzle_offset_forward_px >= 0",
    });
  }


  if (up <= 0n) {
    throw buildError({
      message:
        "Muzzle geometry Cing Artillery yêu cầu muzzle_offset_up_px > 0",
    });
  }


  return Object.freeze({
    muzzle_offset_forward_scaled:
      forward,

    muzzle_offset_up_scaled:
      up,
  });
}


module.exports = {
  normalizeMuzzleGeometryRulesV1,
};
