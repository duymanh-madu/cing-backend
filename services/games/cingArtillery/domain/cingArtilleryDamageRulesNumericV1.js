"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * DAMAGE RULES NUMERIC V1
 *
 * Owns ONLY canonical numeric representation of:
 *
 *   base_damage
 *   blast_min_damage_ratio
 *   damage_formula_version
 *   damage_rounding
 *   self_damage_enabled
 *
 * Canonical representation:
 *
 *   base_damage
 *     -> reduced BigInt rational > 0
 *
 *   blast_min_damage_ratio
 *     -> reduced BigInt rational
 *     -> 0 < ratio <= 1
 *
 *   damage_formula_version
 *     -> exactly 1
 *
 *   damage_rounding
 *     -> exactly "floor"
 *
 *   self_damage_enabled
 *     -> exactly false
 *
 * Important:
 *
 *   No arbitrary damage scale exists.
 *   No physics_fixed_scale dependency exists.
 *   No decimal rule value is rounded here.
 *
 * Example:
 *
 *   base_damage = 300.5
 *
 * becomes:
 *
 *   601 / 2
 *
 * Flooring belongs to Damage Formula V1,
 * not to numeric-rule normalization.
 *
 * This module does NOT:
 *
 *   calculate direct-hit damage
 *   calculate blast falloff
 *   apply attack / defense
 *   inspect impact geometry
 *   inspect target identity
 *   mutate HP
 *   write PostgreSQL
 *   emit realtime events
 */

const {
  toReducedRationalBigIntV1,
} =
  require(
    "./cingArtilleryFixedPoint"
  );


const DAMAGE_FORMULA_VERSION_V1 =
  1;

const DAMAGE_ROUNDING_V1 =
  "floor";


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_DAMAGE_RULES_NUMERIC_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function assertExactInteger(
  value,
  expected,
  field
) {
  if (
    typeof value !==
      "number" ||
    !Number.isSafeInteger(
      value
    ) ||
    value !==
      expected
  ) {
    throw buildError({
      message:
        `Damage rules numeric Cing Artillery không hợp lệ: ${field}`,
    });
  }


  return value;
}


function assertExactText(
  value,
  expected,
  field
) {
  if (
    typeof value !==
      "string" ||
    value !==
      expected
  ) {
    throw buildError({
      message:
        `Damage rules numeric Cing Artillery không hợp lệ: ${field}`,
    });
  }


  return value;
}


function assertFalse(
  value,
  field
) {
  if (
    value !==
      false
  ) {
    throw buildError({
      message:
        `Damage rules numeric Cing Artillery không hợp lệ: ${field}`,
    });
  }


  return value;
}


function assertPositiveRational(
  rational,
  field
) {
  if (
    !rational ||
    typeof rational !==
      "object" ||
    Array.isArray(
      rational
    ) ||
    typeof rational.numerator !==
      "bigint" ||
    typeof rational.denominator !==
      "bigint" ||
    rational.numerator <=
      0n ||
    rational.denominator <=
      0n
  ) {
    throw buildError({
      message:
        `Damage rules numeric Cing Artillery tạo rational không hợp lệ: ${field}`,
    });
  }


  return rational;
}


function normalizeDamageRulesNumericV1({
  baseDamage,
  blastMinDamageRatio,
  damageFormulaVersion,
  damageRounding,
  selfDamageEnabled,
} = {}) {
  let baseDamageRational;
  let blastMinimumRatioRational;


  try {
    baseDamageRational =
      toReducedRationalBigIntV1(
        baseDamage,
        "base_damage"
      );

    blastMinimumRatioRational =
      toReducedRationalBigIntV1(
        blastMinDamageRatio,
        "blast_min_damage_ratio"
      );
  } catch (error) {
    throw buildError({
      message:
        "Damage rules numeric Cing Artillery yêu cầu canonical finite Number rules",
      code:
        "CING_ARTILLERY_DAMAGE_RULES_DECIMAL_INVALID_V1",
    });
  }


  assertPositiveRational(
    baseDamageRational,
    "base_damage"
  );

  assertPositiveRational(
    blastMinimumRatioRational,
    "blast_min_damage_ratio"
  );


  if (
    blastMinimumRatioRational.numerator >
      blastMinimumRatioRational.denominator
  ) {
    throw buildError({
      message:
        "Damage rules numeric Cing Artillery yêu cầu 0 < blast_min_damage_ratio <= 1",
      code:
        "CING_ARTILLERY_BLAST_MIN_DAMAGE_RATIO_OUT_OF_RANGE_V1",
    });
  }


  const version =
    assertExactInteger(
      damageFormulaVersion,
      DAMAGE_FORMULA_VERSION_V1,
      "damage_formula_version"
    );

  const rounding =
    assertExactText(
      damageRounding,
      DAMAGE_ROUNDING_V1,
      "damage_rounding"
    );

  const selfDamage =
    assertFalse(
      selfDamageEnabled,
      "self_damage_enabled"
    );


  return Object.freeze({
    base_damage:
      baseDamageRational,

    blast_min_damage_ratio:
      blastMinimumRatioRational,

    damage_formula_version:
      version,

    damage_rounding:
      rounding,

    self_damage_enabled:
      selfDamage,
  });
}


module.exports = {
  DAMAGE_FORMULA_VERSION_V1,
  DAMAGE_ROUNDING_V1,
  normalizeDamageRulesNumericV1,
};
