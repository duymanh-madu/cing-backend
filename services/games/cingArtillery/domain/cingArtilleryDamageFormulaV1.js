"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * DAMAGE FORMULA V1
 *
 * This file defines the explicit gameplay law for:
 *
 *   base damage
 *   ATK / DEF modifier
 *   direct-hit damage
 *   terrain-blast linear falloff
 *   final floor rounding
 *
 * DAMAGE FORMULA V1
 *
 * Stat modifier:
 *
 *                  2 * ATK
 *   modifier = ----------------
 *                ATK + DEF
 *
 * Properties:
 *
 *   ATK = DEF
 *     -> modifier = 1
 *
 *   modifier is positive
 *   modifier is strictly less than 2
 *
 * Direct hit:
 *
 *   raw =
 *     base_damage
 *     * modifier
 *
 * Terrain blast:
 *
 *   linear_factor =
 *
 *     1 - distance_floor / blast_radius
 *
 *   blast_factor =
 *
 *     max(
 *       blast_min_damage_ratio,
 *       linear_factor
 *     )
 *
 *   raw =
 *     base_damage
 *     * modifier
 *     * blast_factor
 *
 * Final:
 *
 *   damage =
 *
 *     max(
 *       1,
 *       floor(raw)
 *     )
 *
 * The minimum-one rule exists because this formula is invoked
 * only for a canonical affected target, while the durable
 * Resolution Damage Semantics V1 requires positive damage for
 * an affected player.
 *
 * IMPORTANT:
 *
 *   blast distance has already crossed the explicit
 *   ExactBlastDistanceFloorV1 quantization boundary.
 *
 *   No additional rounding occurs before final damage floor.
 *
 * This module does NOT:
 *
 *   establish target identity
 *   inspect collision geometry
 *   calculate exact blast distance
 *   read current HP
 *   mutate HP
 *   write PostgreSQL
 *   advance turn
 *   complete combat
 *   emit realtime events
 */

const DAMAGE_MODE_V1 =
  Object.freeze({
    DIRECT:
      "direct",

    BLAST:
      "blast",
  });


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_DAMAGE_FORMULA_V1",
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
        `Damage Formula V1 Cing Artillery yêu cầu ${field} là positive safe integer`,
    });
  }


  return BigInt(
    value
  );
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
        `Damage Formula V1 Cing Artillery yêu cầu ${field} là BigInt`,
    });
  }


  return value;
}


function assertCanonicalPositiveRational(
  value,
  field
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    ) ||
    typeof value.numerator !==
      "bigint" ||
    typeof value.denominator !==
      "bigint" ||
    value.numerator <=
      0n ||
    value.denominator <=
      0n
  ) {
    throw buildError({
      message:
        `Damage Formula V1 Cing Artillery có rational không hợp lệ: ${field}`,
    });
  }


  return value;
}


function assertDamageRulesNumericV1(
  damageRules
) {
  if (
    !damageRules ||
    typeof damageRules !==
      "object" ||
    Array.isArray(
      damageRules
    )
  ) {
    throw buildError({
      message:
        "Damage Formula V1 Cing Artillery thiếu canonical damage rules",
    });
  }


  const baseDamage =
    assertCanonicalPositiveRational(
      damageRules.base_damage,
      "base_damage"
    );

  const minimumBlastRatio =
    assertCanonicalPositiveRational(
      damageRules.blast_min_damage_ratio,
      "blast_min_damage_ratio"
    );


  if (
    minimumBlastRatio.numerator >
      minimumBlastRatio.denominator ||
    damageRules.damage_formula_version !==
      1 ||
    damageRules.damage_rounding !==
      "floor" ||
    damageRules.self_damage_enabled !==
      false
  ) {
    throw buildError({
      message:
        "Damage Formula V1 Cing Artillery có damage-rule semantics không hợp lệ",
      code:
        "CING_ARTILLERY_DAMAGE_FORMULA_RULES_MISMATCH_V1",
    });
  }


  return {
    baseDamage,
    minimumBlastRatio,
  };
}


function assertStatBindingV1(
  statBinding
) {
  if (
    !statBinding ||
    typeof statBinding !==
      "object" ||
    Array.isArray(
      statBinding
    )
  ) {
    throw buildError({
      message:
        "Damage Formula V1 Cing Artillery thiếu combat stat binding",
    });
  }


  return {
    attack:
      assertPositiveSafeInteger(
        statBinding.attacker_attack,
        "attacker_attack"
      ),

    defense:
      assertPositiveSafeInteger(
        statBinding.defender_defense,
        "defender_defense"
      ),
  };
}


function selectBlastFactorV1({
  minimumBlastRatio,
  distanceFloorScaled,
  blastRadiusScaled,
}) {
  const distance =
    assertBigInt(
      distanceFloorScaled,
      "distance_floor_scaled"
    );

  const radius =
    assertBigInt(
      blastRadiusScaled,
      "blast_radius_scaled"
    );


  if (
    distance <
      0n ||
    radius <=
      0n ||
    distance >
      radius
  ) {
    throw buildError({
      message:
        "Damage Formula V1 Cing Artillery có blast distance/radius không hợp lệ",
      code:
        "CING_ARTILLERY_DAMAGE_FORMULA_BLAST_RANGE_INVALID_V1",
    });
  }


  const linearNumerator =
    radius -
    distance;

  const linearDenominator =
    radius;


  const minimumWins =
    minimumBlastRatio.numerator *
      linearDenominator >=
    linearNumerator *
      minimumBlastRatio.denominator;


  if (
    minimumWins
  ) {
    return minimumBlastRatio;
  }


  return Object.freeze({
    numerator:
      linearNumerator,

    denominator:
      linearDenominator,
  });
}


function floorPositiveRational({
  numerator,
  denominator,
}) {
  if (
    numerator <=
      0n ||
    denominator <=
      0n
  ) {
    throw buildError({
      message:
        "Damage Formula V1 Cing Artillery có final rational không hợp lệ",
      code:
        "CING_ARTILLERY_DAMAGE_FORMULA_RATIONAL_INVALID_V1",
    });
  }


  return (
    numerator /
    denominator
  );
}


function calculateDamageFormulaV1({
  mode,
  damageRules,
  statBinding,
  distanceFloorScaled,
  blastRadiusScaled,
} = {}) {
  if (
    mode !==
      DAMAGE_MODE_V1.DIRECT &&
    mode !==
      DAMAGE_MODE_V1.BLAST
  ) {
    throw buildError({
      message:
        "Damage Formula V1 Cing Artillery có mode không hợp lệ",
      code:
        "CING_ARTILLERY_DAMAGE_FORMULA_MODE_INVALID_V1",
    });
  }


  const {
    baseDamage,
    minimumBlastRatio,
  } =
    assertDamageRulesNumericV1(
      damageRules
    );

  const {
    attack,
    defense,
  } =
    assertStatBindingV1(
      statBinding
    );


  let blastFactorNumerator =
    1n;

  let blastFactorDenominator =
    1n;


  if (
    mode ===
      DAMAGE_MODE_V1.DIRECT
  ) {
    if (
      distanceFloorScaled !==
        undefined ||
      blastRadiusScaled !==
        undefined
    ) {
      throw buildError({
        message:
          "Damage Formula V1 direct mode không nhận blast geometry",
        code:
          "CING_ARTILLERY_DAMAGE_FORMULA_DIRECT_GEOMETRY_FORBIDDEN_V1",
      });
    }
  } else {
    const blastFactor =
      selectBlastFactorV1({
        minimumBlastRatio,
        distanceFloorScaled,
        blastRadiusScaled,
      });


    blastFactorNumerator =
      blastFactor.numerator;

    blastFactorDenominator =
      blastFactor.denominator;
  }


  /*
   * Exact raw damage:
   *
   *   base_num
   *   --------
   *   base_den
   *
   *       *
   *
   *      2A
   *   --------
   *    A + D
   *
   *       *
   *
   *   blast_factor
   *
   * No intermediate floor.
   */
  const rawNumerator =
    baseDamage.numerator *
    2n *
    attack *
    blastFactorNumerator;

  const rawDenominator =
    baseDamage.denominator *
    (
      attack +
      defense
    ) *
    blastFactorDenominator;


  const floored =
    floorPositiveRational({
      numerator:
        rawNumerator,

      denominator:
        rawDenominator,
    });


  const damage =
    floored <
      1n
      ? 1n
      : floored;


  return Object.freeze({
    mode,

    damage,

    raw_damage_numerator:
      rawNumerator,

    raw_damage_denominator:
      rawDenominator,
  });
}


module.exports = {
  DAMAGE_MODE_V1,
  calculateDamageFormulaV1,
};
