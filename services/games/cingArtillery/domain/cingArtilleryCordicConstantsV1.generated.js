"use strict";

/*
 * AUTO-GENERATED FILE — DO NOT EDIT.
 *
 * Generator:
 *   tools/cingArtillery/generateCordicConstantsV1.py
 *
 * CING PIU PIU / CING ARTILLERY
 * DETERMINISTIC CORDIC CONSTANTS V1
 *
 * trig_algorithm_version:
 *   1
 *
 * cordic_iterations:
 *   32
 *
 * trig_angle_scale:
 *   1000000000 units / degree
 *
 * trig_value_scale:
 *   1000000000 units / 1.0
 *
 * generation_rounding:
 *   ROUND_HALF_EVEN
 *
 * Runtime authority:
 *   immutable BigInt constants only
 *
 * No floating-point trig authority exists here.
 */

const CORDIC_ATAN_DEG_UNITS_V1 =
  Object.freeze([
  45000000000n,
  26565051177n,
  14036243468n,
  7125016349n,
  3576334375n,
  1789910608n,
  895173710n,
  447614171n,
  223810500n,
  111905677n,
  55952892n,
  27976453n,
  13988227n,
  6994114n,
  3497057n,
  1748528n,
  874264n,
  437132n,
  218566n,
  109283n,
  54642n,
  27321n,
  13660n,
  6830n,
  3415n,
  1708n,
  854n,
  427n,
  213n,
  107n,
  53n,
  27n,
  ]);

const CORDIC_INVERSE_GAIN_VALUE_UNITS_V1 =
  607252935n;

const CORDIC_CONSTANTS_V1_SEMANTIC_SHA256 =
  "03d53e3178e700cb49a562c819037d0aaec995acc0de44debe65d6e6e5a0d2be";

module.exports = {
  CORDIC_ATAN_DEG_UNITS_V1,
  CORDIC_INVERSE_GAIN_VALUE_UNITS_V1,
  CORDIC_CONSTANTS_V1_SEMANTIC_SHA256,
};
