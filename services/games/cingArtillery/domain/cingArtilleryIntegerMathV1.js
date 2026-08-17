"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * INTEGER MATH FOUNDATION V1
 *
 * Pure BigInt deterministic math only.
 *
 * Canonical square-root rule:
 *
 *   integerSqrtFloor(n) =
 *     largest integer r such that
 *
 *       r² <= n
 *
 * This intentionally uses no Number conversion and no
 * Math.sqrt().
 */

function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_INTEGER_MATH",
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
  if (typeof value !== "bigint") {
    throw buildError({
      message:
        `Integer math Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}

function integerSqrtFloor(
  value
) {
  const n =
    assertBigInt(
      value,
      "value"
    );

  if (n < 0n) {
    throw buildError({
      message:
        "Integer math Cing Artillery không hỗ trợ căn số âm",
      code:
        "CING_ARTILLERY_INTEGER_SQRT_NEGATIVE",
    });
  }

  if (n < 2n) {
    return n;
  }

  /*
   * Deterministic Newton iteration.
   *
   * Start with a power-of-two upper approximation derived
   * from integer bit length only.
   */
  const bitLength =
    n
      .toString(2)
      .length;

  const halfBitLengthCeil =
    Math.floor(
      (bitLength + 1) / 2
    );

  let x =
    1n <<
    BigInt(
      halfBitLengthCeil
    );

  while (true) {
    const next =
      (
        x +
        n / x
      ) >> 1n;

    if (next >= x) {
      return x;
    }

    x =
      next;
  }
}

function integerDistanceFloor({
  ax,
  ay,
  bx,
  by,
}) {
  const x1 =
    assertBigInt(
      ax,
      "ax"
    );

  const y1 =
    assertBigInt(
      ay,
      "ay"
    );

  const x2 =
    assertBigInt(
      bx,
      "bx"
    );

  const y2 =
    assertBigInt(
      by,
      "by"
    );

  const dx =
    x1 - x2;

  const dy =
    y1 - y2;

  return integerSqrtFloor(
    dx * dx +
    dy * dy
  );
}

module.exports = {
  integerSqrtFloor,
  integerDistanceFloor,
};
