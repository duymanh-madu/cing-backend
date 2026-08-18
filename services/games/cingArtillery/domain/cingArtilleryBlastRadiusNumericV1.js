"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * BLAST RADIUS NUMERIC V1
 *
 * Owns ONLY the canonical fixed-point representation of:
 *
 *   blast_radius
 *
 * GameRulesV2 expresses blast_radius in solver-space /
 * pixel units as a finite positive Number.
 *
 * Exact runtime geometry requires the same value on the
 * physics_fixed_scale lattice as:
 *
 *   trajectory coordinates
 *   exact impact coordinates
 *   player collider center
 *
 * Therefore:
 *
 *   blast_radius_scaled =
 *     exact blast_radius * physics_fixed_scale
 *
 * The value must already be exactly representable on the
 * configured physics_fixed_scale.
 *
 * No rounding is permitted.
 *
 * This module does NOT:
 *
 *   decide blast eligibility
 *   inspect exact impact
 *   inspect opponent collider
 *   calculate distance
 *   calculate damage
 *   select target identity
 *   mutate gameplay
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  MAX_SAFE_SCALED_MAGNITUDE,
  toScaledBigInt,
} =
  require(
    "./cingArtilleryFixedPoint"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_BLAST_RADIUS_NUMERIC_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
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
    value <=
      0
  ) {
    throw buildError({
      message:
        `Blast radius numeric Cing Artillery không hợp lệ: ${field}`,
    });
  }


  return value;
}


function normalizeBlastRadiusNumericV1({
  blastRadius,
  physicsFixedScale,
} = {}) {
  if (
    typeof blastRadius !==
      "number" ||
    !Number.isFinite(
      blastRadius
    ) ||
    blastRadius <=
      0
  ) {
    throw buildError({
      message:
        "Blast radius numeric Cing Artillery yêu cầu blast_radius hữu hạn và > 0",
    });
  }


  const scale =
    assertPositiveSafeInteger(
      physicsFixedScale,
      "physics_fixed_scale"
    );


  let blastRadiusScaled;


  try {
    blastRadiusScaled =
      toScaledBigInt(
        blastRadius,
        scale,
        "blast_radius"
      );
  } catch (error) {
    throw buildError({
      message:
        "Blast radius numeric Cing Artillery yêu cầu blast_radius nằm chính xác trên physics_fixed_scale",
      code:
        "CING_ARTILLERY_BLAST_RADIUS_NOT_EXACTLY_REPRESENTABLE_V1",
    });
  }


  if (
    blastRadiusScaled <=
      0n ||
    blastRadiusScaled >
      MAX_SAFE_SCALED_MAGNITUDE
  ) {
    throw buildError({
      message:
        "Blast radius numeric Cing Artillery vượt canonical scaled magnitude",
      code:
        "CING_ARTILLERY_BLAST_RADIUS_SCALED_OUT_OF_RANGE_V1",
    });
  }


  return Object.freeze({
    blast_radius:
      blastRadius,

    physics_fixed_scale:
      scale,

    blast_radius_scaled:
      blastRadiusScaled,
  });
}


module.exports = {
  normalizeBlastRadiusNumericV1,
};
