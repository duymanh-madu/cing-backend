"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * CONTACT PARAMETER COMPARATOR V1
 *
 * Exact ordering for canonical Contact Parameter V1 values.
 *
 * Returns:
 *
 *   -1  left < right
 *    0  left = right
 *    1  left > right
 *
 * Supported comparisons:
 *
 *   rational <-> rational
 *   rational <-> quadratic_lower_root
 *   quadratic_lower_root <-> quadratic_lower_root
 *
 * No floating point.
 * No Math.sqrt().
 * No floor-sqrt approximation is used for ordering.
 *
 * ------------------------------------------------------
 * RATIONAL VS QUADRATIC
 * ------------------------------------------------------
 *
 * q =
 *   (-b - sqrt(D)) / (2a)
 *
 * r =
 *   n / d
 *
 * with a,d > 0.
 *
 * Compare:
 *
 *   q - r
 *
 * whose sign equals:
 *
 *   S - d*sqrt(D)
 *
 * where:
 *
 *   S = -b*d - 2*a*n
 *
 * If S < 0, result is immediately negative.
 *
 * Otherwise compare exactly:
 *
 *   S²
 *      vs
 *   d²*D
 *
 * ------------------------------------------------------
 * QUADRATIC VS QUADRATIC
 * ------------------------------------------------------
 *
 * q1 =
 *   (-b1 - sqrt(D1)) / (2a1)
 *
 * q2 =
 *   (-b2 - sqrt(D2)) / (2a2)
 *
 * Since denominators are positive, sign(q1-q2) equals:
 *
 *   c + sqrt(x) - sqrt(y)
 *
 * where:
 *
 *   c = a1*b2 - a2*b1
 *   x = a1²*D2
 *   y = a2²*D1
 *
 * sign(c + sqrt(x) - sqrt(y)) is determined exactly
 * through integer sign tests and squared comparisons.
 *
 * This module owns ORDERING only.
 *
 * It does NOT:
 *
 *   derive collision parameters
 *   choose collision precedence policy
 *   identify terrain/player
 *   calculate impact coordinates
 *   mutate gameplay
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  CONTACT_PARAMETER_KIND_V1,

  createRationalContactParameterV1,
  createQuadraticLowerRootContactParameterV1,
} =
  require(
    "./cingArtilleryContactParameterV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_CONTACT_PARAMETER_COMPARATOR_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function compareBigInt(
  left,
  right
) {
  if (
    left < right
  ) {
    return -1;
  }

  if (
    left > right
  ) {
    return 1;
  }

  return 0;
}


function assertObject(
  value,
  field
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    throw buildError({
      message:
        `Contact parameter comparator Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function assertCanonicalContactParameter(
  value,
  field
) {
  const parameter =
    assertObject(
      value,
      field
    );


  if (
    parameter.kind ===
    CONTACT_PARAMETER_KIND_V1.RATIONAL
  ) {
    let canonical;

    try {
      canonical =
        createRationalContactParameterV1({
          numerator:
            parameter.numerator,

          denominator:
            parameter.denominator,
        });
    } catch (error) {
      throw buildError({
        message:
          `Contact parameter comparator Cing Artillery nhận ${field} rational không hợp lệ`,
      });
    }


    if (
      canonical.kind !==
        CONTACT_PARAMETER_KIND_V1.RATIONAL ||
      canonical.numerator !==
        parameter.numerator ||
      canonical.denominator !==
        parameter.denominator
    ) {
      throw buildError({
        message:
          `Contact parameter comparator Cing Artillery yêu cầu ${field} ở canonical rational form`,
        code:
          "CING_ARTILLERY_NON_CANONICAL_CONTACT_PARAMETER_V1",
      });
    }


    return parameter;
  }


  if (
    parameter.kind ===
    CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT
  ) {
    let canonical;

    try {
      canonical =
        createQuadraticLowerRootContactParameterV1({
          a:
            parameter.a,

          b:
            parameter.b,

          discriminant:
            parameter.discriminant,
        });
    } catch (error) {
      throw buildError({
        message:
          `Contact parameter comparator Cing Artillery nhận ${field} quadratic không hợp lệ`,
      });
    }


    if (
      canonical.kind !==
        CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT ||
      canonical.a !==
        parameter.a ||
      canonical.b !==
        parameter.b ||
      canonical.discriminant !==
        parameter.discriminant
    ) {
      throw buildError({
        message:
          `Contact parameter comparator Cing Artillery yêu cầu ${field} ở canonical quadratic form`,
        code:
          "CING_ARTILLERY_NON_CANONICAL_CONTACT_PARAMETER_V1",
      });
    }


    return parameter;
  }


  throw buildError({
    message:
      `Contact parameter comparator Cing Artillery không hỗ trợ kind của ${field}`,
  });
}


function compareRationalToRational(
  left,
  right
) {
  return compareBigInt(
    left.numerator *
      right.denominator,

    right.numerator *
      left.denominator
  );
}


function compareQuadraticToRational(
  quadratic,
  rational
) {
  /*
   * q - r has the same sign as:
   *
   * S - d*sqrt(D)
   *
   * S =
   *   -b*d - 2*a*n
   */
  const s =
    -quadratic.b *
      rational.denominator -
    2n *
      quadratic.a *
      rational.numerator;


  if (
    s < 0n
  ) {
    return -1;
  }


  const leftSquared =
    s * s;

  const rightSquared =
    rational.denominator *
    rational.denominator *
    quadratic.discriminant;


  /*
   * Canonical quadratic parameters always have
   * non-perfect-square discriminants.
   *
   * Therefore equality with a rational parameter cannot
   * occur here.
   */
  return compareBigInt(
    leftSquared,
    rightSquared
  );
}


function signIntegerPlusSqrtMinusSqrt({
  integer,
  positiveRadicand,
  negativeRadicand,
}) {
  const c =
    integer;

  const x =
    positiveRadicand;

  const y =
    negativeRadicand;


  if (
    x < 0n ||
    y < 0n
  ) {
    throw buildError({
      message:
        "Contact parameter comparator Cing Artillery nhận radicand âm",
    });
  }


  /*
   * Determine sign of:
   *
   *   c + sqrt(x) - sqrt(y)
   */


  if (
    c === 0n
  ) {
    return compareBigInt(
      x,
      y
    );
  }


  if (
    c > 0n
  ) {
    /*
     * If sqrt(x) >= sqrt(y), c makes the entire
     * expression strictly positive.
     */
    if (
      x >= y
    ) {
      return 1;
    }


    /*
     * Need:
     *
     *   c + sqrt(x)
     *      ? sqrt(y)
     *
     * Both sides are non-negative.
     *
     * Square once:
     *
     *   c² + x + 2c sqrt(x)
     *      ? y
     *
     * Let:
     *
     *   k = y - x - c²
     *
     * If k <= 0, left side is already greater.
     */
    const k =
      y -
      x -
      c * c;


    if (
      k <= 0n
    ) {
      return 1;
    }


    /*
     * Compare:
     *
     *   2c sqrt(x)
     *      ? k
     *
     * Both sides positive, therefore square exactly.
     */
    return compareBigInt(
      4n *
        c *
        c *
        x,

      k *
        k
    );
  }


  /*
   * c < 0.
   *
   * Let d = -c > 0:
   *
   *   sqrt(x) - sqrt(y) - d
   */

  const d =
    -c;


  if (
    x <= y
  ) {
    return -1;
  }


  /*
   * Need:
   *
   *   sqrt(x)
   *      ? d + sqrt(y)
   *
   * Square once:
   *
   *   x
   *      ? d² + y + 2d sqrt(y)
   *
   * Let:
   *
   *   k = x - y - d²
   */
  const k =
    x -
    y -
    d * d;


  if (
    k <= 0n
  ) {
    return -1;
  }


  /*
   * Compare:
   *
   *   k
   *      ? 2d sqrt(y)
   *
   * Both sides positive, therefore square exactly.
   */
  return compareBigInt(
    k *
      k,

    4n *
      d *
      d *
      y
  );
}


function compareQuadraticToQuadratic(
  left,
  right
) {
  /*
   * sign(left - right) =
   *
   * sign(
   *   c +
   *   sqrt(x) -
   *   sqrt(y)
   * )
   *
   * with:
   *
   *   c =
   *     a1*b2 -
   *     a2*b1
   *
   *   x =
   *     a1²*D2
   *
   *   y =
   *     a2²*D1
   */
  const c =
    left.a *
      right.b -
    right.a *
      left.b;

  const x =
    left.a *
    left.a *
    right.discriminant;

  const y =
    right.a *
    right.a *
    left.discriminant;


  return signIntegerPlusSqrtMinusSqrt({
    integer:
      c,

    positiveRadicand:
      x,

    negativeRadicand:
      y,
  });
}


function compareContactParametersV1(
  left,
  right
) {
  const a =
    assertCanonicalContactParameter(
      left,
      "left"
    );

  const b =
    assertCanonicalContactParameter(
      right,
      "right"
    );


  if (
    a === b
  ) {
    return 0;
  }


  if (
    a.kind ===
      CONTACT_PARAMETER_KIND_V1.RATIONAL &&
    b.kind ===
      CONTACT_PARAMETER_KIND_V1.RATIONAL
  ) {
    return compareRationalToRational(
      a,
      b
    );
  }


  if (
    a.kind ===
      CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT &&
    b.kind ===
      CONTACT_PARAMETER_KIND_V1.RATIONAL
  ) {
    return compareQuadraticToRational(
      a,
      b
    );
  }


  if (
    a.kind ===
      CONTACT_PARAMETER_KIND_V1.RATIONAL &&
    b.kind ===
      CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT
  ) {
    return -compareQuadraticToRational(
      b,
      a
    );
  }


  if (
    a.kind ===
      CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT &&
    b.kind ===
      CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT
  ) {
    return compareQuadraticToQuadratic(
      a,
      b
    );
  }


  throw buildError({
    message:
      "Contact parameter comparator Cing Artillery gặp combination không hỗ trợ",
  });
}


module.exports = {
  compareContactParametersV1,
};
