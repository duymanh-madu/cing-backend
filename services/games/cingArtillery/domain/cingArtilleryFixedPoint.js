"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * FIXED-POINT NUMERIC FOUNDATION V1
 *
 * Pure deterministic numeric primitives only.
 *
 * No:
 *   gameplay tuning
 *   trajectory integration
 *   collision
 *   database access
 *   Date.now
 *   Math.random
 *   Math.sin / Math.cos
 *   floating-point rounding authority
 *
 * Canonical physics values enter the solver by being
 * converted to scaled BigInt values first.
 */

const MAX_SAFE_SCALED_MAGNITUDE =
  BigInt(
    Number.MAX_SAFE_INTEGER
  );

function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_FIXED_POINT",
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
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw buildError({
      message:
        `Fixed-point Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}

function assertBigInt(
  value,
  field
) {
  if (
    typeof value !== "bigint"
  ) {
    throw buildError({
      message:
        `Fixed-point Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}

function pow10BigInt(
  exponent
) {
  if (
    !Number.isSafeInteger(exponent) ||
    exponent < 0
  ) {
    throw buildError({
      message:
        "Fixed-point Cing Artillery có decimal exponent không hợp lệ",
    });
  }

  return 10n ** BigInt(exponent);
}

function parseCanonicalNumberDecimal(
  value,
  field
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw buildError({
      message:
        `Fixed-point Cing Artillery không hợp lệ: ${field}`,
    });
  }

  /*
   * Number#toString() gives the canonical shortest decimal
   * representation that round-trips to the same ECMAScript
   * Number. We parse that representation ourselves and never
   * multiply the original floating-point value by scale.
   */
  const text =
    value.toString().toLowerCase();

  const match =
    /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/u
      .exec(text);

  if (!match) {
    throw buildError({
      message:
        `Fixed-point Cing Artillery không parse được ${field}`,
    });
  }

  const sign =
    match[1] === "-"
      ? -1n
      : 1n;

  const integerDigits =
    match[2];

  const fractionDigits =
    match[3] || "";

  const exponent =
    match[4] === undefined
      ? 0
      : Number(match[4]);

  if (
    !Number.isSafeInteger(exponent)
  ) {
    throw buildError({
      message:
        `Fixed-point Cing Artillery có exponent không hợp lệ: ${field}`,
    });
  }

  const coefficient =
    BigInt(
      `${integerDigits}${fractionDigits}`
    );

  const decimalExponent =
    exponent -
    fractionDigits.length;

  return {
    sign,
    coefficient,
    decimalExponent,
  };
}

function toScaledBigInt(
  value,
  scale,
  field = "value"
) {
  const normalizedScale =
    assertPositiveSafeInteger(
      scale,
      "scale"
    );

  const {
    sign,
    coefficient,
    decimalExponent,
  } =
    parseCanonicalNumberDecimal(
      value,
      field
    );

  let magnitude;

  if (decimalExponent >= 0) {
    magnitude =
      coefficient *
      pow10BigInt(
        decimalExponent
      ) *
      BigInt(normalizedScale);
  } else {
    const denominator =
      pow10BigInt(
        -decimalExponent
      );

    const numerator =
      coefficient *
      BigInt(normalizedScale);

    /*
     * Fail closed:
     *
     * a rules value must lie exactly on the configured
     * fixed-point grid. No implicit rounding is allowed.
     */
    if (
      numerator %
        denominator !==
      0n
    ) {
      throw buildError({
        message:
          `Fixed-point Cing Artillery không biểu diễn chính xác: ${field}`,
        code:
          "CING_ARTILLERY_FIXED_POINT_QUANTIZATION_ERROR",
      });
    }

    magnitude =
      numerator /
      denominator;
  }

  const scaled =
    sign *
    magnitude;

  const absolute =
    scaled < 0n
      ? -scaled
      : scaled;

  /*
   * Inputs remain bounded to JS safe-integer magnitude even
   * though solver intermediates will use BigInt.
   *
   * This prevents accidentally publishing absurd numeric
   * rules that cannot safely cross normal JS/domain
   * boundaries.
   */
  if (
    absolute >
    MAX_SAFE_SCALED_MAGNITUDE
  ) {
    throw buildError({
      message:
        `Fixed-point Cing Artillery vượt safe magnitude: ${field}`,
      code:
        "CING_ARTILLERY_FIXED_POINT_RANGE_ERROR",
    });
  }

  return scaled;
}

function floorDivBigInt(
  numerator,
  denominator
) {
  const n =
    assertBigInt(
      numerator,
      "numerator"
    );

  const d =
    assertBigInt(
      denominator,
      "denominator"
    );

  if (d === 0n) {
    throw buildError({
      message:
        "Fixed-point Cing Artillery không thể chia cho 0",
      code:
        "CING_ARTILLERY_FIXED_POINT_DIVIDE_BY_ZERO",
    });
  }

  let quotient =
    n / d;

  const remainder =
    n % d;

  /*
   * BigInt division truncates toward zero.
   *
   * Physics V1 needs mathematical FLOOR semantics so
   * negative acceleration/wind behaves symmetrically.
   */
  if (
    remainder !== 0n &&
    (
      (remainder > 0n && d < 0n) ||
      (remainder < 0n && d > 0n)
    )
  ) {
    quotient -= 1n;
  }

  return quotient;
}

function mulDivFloorBigInt(
  left,
  right,
  denominator
) {
  const a =
    assertBigInt(
      left,
      "left"
    );

  const b =
    assertBigInt(
      right,
      "right"
    );

  return floorDivBigInt(
    a * b,
    denominator
  );
}

function clampBigInt(
  value,
  minimum,
  maximum
) {
  const v =
    assertBigInt(
      value,
      "value"
    );

  const min =
    assertBigInt(
      minimum,
      "minimum"
    );

  const max =
    assertBigInt(
      maximum,
      "maximum"
    );

  if (min > max) {
    throw buildError({
      message:
        "Fixed-point Cing Artillery có clamp range không hợp lệ",
    });
  }

  if (v < min) {
    return min;
  }

  if (v > max) {
    return max;
  }

  return v;
}

function absBigInt(
  value
) {
  const v =
    assertBigInt(
      value,
      "value"
    );

  return v < 0n
    ? -v
    : v;
}

module.exports = {
  MAX_SAFE_SCALED_MAGNITUDE,

  toScaledBigInt,

  floorDivBigInt,
  mulDivFloorBigInt,

  clampBigInt,
  absBigInt,
};
