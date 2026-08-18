"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * CONTACT PARAMETER REPRESENTATION V1
 *
 * Exact canonical representation of a collision parameter
 * t on one closed trajectory segment:
 *
 *   0 <= t <= 1
 *
 * Supported exact forms:
 *
 *   rational
 *
 *     numerator / denominator
 *
 *   quadratic_lower_root
 *
 *     (-b - sqrt(discriminant)) / (2a)
 *
 * where all stored coefficients are BigInt.
 *
 * IMPORTANT:
 *
 * A quadratic lower root whose discriminant is a perfect
 * square is canonicalized to rational form immediately.
 * Therefore the same exact value cannot have both a
 * rational and quadratic representation.
 *
 * This module owns REPRESENTATION only.
 *
 * It does NOT:
 *
 *   derive collision coefficients
 *   compare two contact parameters
 *   choose earliest collision
 *   calculate impact coordinates
 *   know player or terrain semantics
 *   inspect trajectory samples
 *   mutate gameplay
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  integerSqrtFloor,
} =
  require(
    "./cingArtilleryIntegerMathV1"
  );


const CONTACT_PARAMETER_KIND_V1 =
  Object.freeze({
    RATIONAL:
      "rational",

    QUADRATIC_LOWER_ROOT:
      "quadratic_lower_root",
  });


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_CONTACT_PARAMETER_V1",
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
        `Contact parameter Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function absBigIntLocal(
  value
) {
  return value < 0n
    ? -value
    : value;
}


function gcdPositiveBigInt(
  left,
  right
) {
  let a =
    absBigIntLocal(
      left
    );

  let b =
    absBigIntLocal(
      right
    );

  while (
    b !== 0n
  ) {
    const remainder =
      a % b;

    a =
      b;

    b =
      remainder;
  }

  return a;
}


function createRationalContactParameterV1({
  numerator,
  denominator,
}) {
  let n =
    assertBigInt(
      numerator,
      "numerator"
    );

  let d =
    assertBigInt(
      denominator,
      "denominator"
    );


  /*
   * Canonical input requires a strictly positive
   * denominator. We deliberately reject negative
   * denominators instead of silently moving their sign.
   */
  if (
    d <= 0n
  ) {
    throw buildError({
      message:
        "Contact parameter Cing Artillery yêu cầu denominator > 0",
    });
  }


  if (
    n < 0n ||
    n > d
  ) {
    throw buildError({
      message:
        "Contact parameter Cing Artillery phải nằm trong đoạn [0,1]",
      code:
        "CING_ARTILLERY_CONTACT_PARAMETER_OUT_OF_SEGMENT_V1",
    });
  }


  /*
   * Canonical zero and one have unique representations.
   */
  if (
    n === 0n
  ) {
    return Object.freeze({
      kind:
        CONTACT_PARAMETER_KIND_V1.RATIONAL,

      numerator:
        0n,

      denominator:
        1n,
    });
  }


  if (
    n === d
  ) {
    return Object.freeze({
      kind:
        CONTACT_PARAMETER_KIND_V1.RATIONAL,

      numerator:
        1n,

      denominator:
        1n,
    });
  }


  const divisor =
    gcdPositiveBigInt(
      n,
      d
    );


  n /=
    divisor;

  d /=
    divisor;


  return Object.freeze({
    kind:
      CONTACT_PARAMETER_KIND_V1.RATIONAL,

    numerator:
      n,

    denominator:
      d,
  });
}


function quadraticLowerRootIsNonNegative({
  b,
  discriminant,
}) {
  /*
   * t >= 0
   *
   * (-b - sqrt(D)) / (2a) >= 0
   *
   * because a > 0:
   *
   *   -b >= sqrt(D)
   *
   * which requires:
   *
   *   b <= 0
   *   b² >= D
   */
  if (
    b > 0n
  ) {
    return false;
  }

  return (
    b * b >=
    discriminant
  );
}


function quadraticLowerRootIsAtMostOne({
  a,
  b,
  discriminant,
}) {
  /*
   * t <= 1
   *
   * -b - sqrt(D) <= 2a
   *
   * Rearrange:
   *
   *   k = -b - 2a
   *
   * If k <= 0 then the inequality is automatically true
   * because sqrt(D) >= 0.
   *
   * Otherwise require:
   *
   *   sqrt(D) >= k
   *
   * equivalent exactly to:
   *
   *   D >= k²
   */
  const k =
    -b -
    2n * a;

  if (
    k <= 0n
  ) {
    return true;
  }

  return (
    discriminant >=
    k * k
  );
}


function createQuadraticLowerRootContactParameterV1({
  a,
  b,
  discriminant,
}) {
  const coefficientA =
    assertBigInt(
      a,
      "a"
    );

  const coefficientB =
    assertBigInt(
      b,
      "b"
    );

  const d =
    assertBigInt(
      discriminant,
      "discriminant"
    );


  if (
    coefficientA <= 0n
  ) {
    throw buildError({
      message:
        "Contact parameter quadratic Cing Artillery yêu cầu a > 0",
    });
  }


  if (
    d < 0n
  ) {
    throw buildError({
      message:
        "Contact parameter quadratic Cing Artillery yêu cầu discriminant >= 0",
    });
  }


  if (
    !quadraticLowerRootIsNonNegative({
      b:
        coefficientB,

      discriminant:
        d,
    }) ||
    !quadraticLowerRootIsAtMostOne({
      a:
        coefficientA,

      b:
        coefficientB,

      discriminant:
        d,
    })
  ) {
    throw buildError({
      message:
        "Contact parameter quadratic Cing Artillery nằm ngoài đoạn [0,1]",
      code:
        "CING_ARTILLERY_CONTACT_PARAMETER_OUT_OF_SEGMENT_V1",
    });
  }


  const sqrtFloor =
    integerSqrtFloor(
      d
    );


  /*
   * Perfect-square roots are rational.
   *
   * Canonicalize immediately so exact-equal values never
   * have two representation kinds.
   */
  if (
    sqrtFloor *
      sqrtFloor ===
    d
  ) {
    return createRationalContactParameterV1({
      numerator:
        -coefficientB -
        sqrtFloor,

      denominator:
        2n *
        coefficientA,
    });
  }


  return Object.freeze({
    kind:
      CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT,

    a:
      coefficientA,

    b:
      coefficientB,

    discriminant:
      d,
  });
}


module.exports = {
  CONTACT_PARAMETER_KIND_V1,

  createRationalContactParameterV1,
  createQuadraticLowerRootContactParameterV1,
};
