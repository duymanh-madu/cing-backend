"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * AFFINE CONTACT POINT VS CIRCLE MEMBERSHIP V1
 *
 * Exact predicate:
 *
 *   affine contact point
 *   is inside or on
 *   one fixed circle.
 *
 * Exact point:
 *
 *   x = x0 + dx * t
 *   y = y0 + dy * t
 *
 * where t is canonical ContactParameterV1:
 *
 *   rational
 *
 * or
 *
 *   quadratic_lower_root
 *
 * Circle:
 *
 *   center = (cx, cy)
 *   radius = r
 *
 * Membership:
 *
 *   (x - cx)^2 +
 *   (y - cy)^2
 *   <= r^2
 *
 * Define:
 *
 *   ux = x0 - cx
 *   uy = y0 - cy
 *
 *   A = dx^2 + dy^2
 *
 *   B =
 *     2 * (
 *       ux * dx +
 *       uy * dy
 *     )
 *
 *   C =
 *     ux^2 +
 *     uy^2 -
 *     r^2
 *
 * Then membership is exactly:
 *
 *   F(t) =
 *     A*t^2 +
 *     B*t +
 *     C
 *     <= 0
 *
 * Rational t = p/q:
 *
 *   A*p^2 +
 *   B*p*q +
 *   C*q^2
 *   <= 0
 *
 * Quadratic lower root:
 *
 *   t =
 *     (-b - sqrt(D)) /
 *     (2a)
 *
 * After multiplying by positive 4a^2:
 *
 *   P + Q*sqrt(D) <= 0
 *
 * where:
 *
 *   P =
 *     A*(b^2 + D)
 *     - 2*a*B*b
 *     + 4*a^2*C
 *
 *   Q =
 *     2*(A*b - a*B)
 *
 * The radical sign comparison is resolved exactly by
 * sign analysis and integer squaring.
 *
 * No numerical square root is ever evaluated.
 *
 * Tangency is inside because the circle is closed.
 *
 * This module does NOT:
 *
 *   know blast semantics
 *   know player identity
 *   know collider radius semantics
 *   convert rule-space units
 *   use compatibility numeric impact
 *   calculate blast falloff
 *   calculate damage
 *   materialize target_account_id
 *   mutate HP
 *   access PostgreSQL
 *   access realtime transport
 */

const {
  SEGMENT_CONTACT_POINT_KIND_V1,
} =
  require(
    "./cingArtillerySegmentContactPointV1"
  );

const {
  CONTACT_PARAMETER_KIND_V1,
} =
  require(
    "./cingArtilleryContactParameterV1"
  );

const {
  compareContactParametersV1,
} =
  require(
    "./cingArtilleryContactParameterComparatorV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_AFFINE_CONTACT_POINT_CIRCLE_MEMBERSHIP_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
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
        `Affine point/circle membership Cing Artillery không hợp lệ: ${field}`,
    });
  }


  return value;
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
        `Affine point/circle membership Cing Artillery yêu cầu ${field} là BigInt`,
    });
  }


  return value;
}


function assertPositiveBigInt(
  value,
  field
) {
  const normalized =
    assertBigInt(
      value,
      field
    );


  if (
    normalized <=
      0n
  ) {
    throw buildError({
      message:
        `Affine point/circle membership Cing Artillery yêu cầu ${field} > 0`,
    });
  }


  return normalized;
}


function assertCanonicalContactParameter(
  value
) {
  const parameter =
    assertObject(
      value,
      "contact_parameter"
    );


  try {
    compareContactParametersV1(
      parameter,
      parameter
    );
  } catch (error) {
    throw buildError({
      message:
        "Affine point/circle membership Cing Artillery yêu cầu canonical ContactParameterV1",
      code:
        "CING_ARTILLERY_AFFINE_CIRCLE_NON_CANONICAL_CONTACT_PARAMETER_V1",
    });
  }


  return parameter;
}


function assertAffineCoordinate(
  value,
  field
) {
  const coordinate =
    assertObject(
      value,
      field
    );


  if (
    coordinate.kind !==
      SEGMENT_CONTACT_POINT_KIND_V1.COORDINATE
  ) {
    throw buildError({
      message:
        `Affine point/circle membership Cing Artillery có ${field}.kind không hợp lệ`,
    });
  }


  return {
    start_scaled:
      assertBigInt(
        coordinate.start_scaled,
        `${field}.start_scaled`
      ),

    delta_scaled:
      assertBigInt(
        coordinate.delta_scaled,
        `${field}.delta_scaled`
      ),

    contact_parameter:
      assertCanonicalContactParameter(
        coordinate.contact_parameter
      ),
  };
}


function assertExactPoint(
  value
) {
  const point =
    assertObject(
      value,
      "exact_point"
    );


  if (
    point.kind !==
      SEGMENT_CONTACT_POINT_KIND_V1.POINT
  ) {
    throw buildError({
      message:
        "Affine point/circle membership Cing Artillery yêu cầu affine_contact_point",
    });
  }


  const x =
    assertAffineCoordinate(
      point.x_coordinate,
      "x_coordinate"
    );

  const y =
    assertAffineCoordinate(
      point.y_coordinate,
      "y_coordinate"
    );


  if (
    point.x_coordinate.contact_parameter !==
      point.y_coordinate.contact_parameter
  ) {
    throw buildError({
      message:
        "Affine point/circle membership Cing Artillery yêu cầu X/Y dùng cùng ContactParameterV1 object",
      code:
        "CING_ARTILLERY_AFFINE_CIRCLE_PARAMETER_IDENTITY_MISMATCH_V1",
    });
  }


  return {
    x,
    y,

    contact_parameter:
      x.contact_parameter,
  };
}


function deriveDistancePolynomialV1({
  point,
  circleCenterXScaled,
  circleCenterYScaled,
  radiusScaled,
}) {
  const cx =
    assertBigInt(
      circleCenterXScaled,
      "circle_center_x_scaled"
    );

  const cy =
    assertBigInt(
      circleCenterYScaled,
      "circle_center_y_scaled"
    );

  const radius =
    assertPositiveBigInt(
      radiusScaled,
      "radius_scaled"
    );


  const ux =
    point.x.start_scaled -
    cx;

  const uy =
    point.y.start_scaled -
    cy;

  const dx =
    point.x.delta_scaled;

  const dy =
    point.y.delta_scaled;


  const coefficientA =
    dx *
      dx +
    dy *
      dy;

  const coefficientB =
    2n *
    (
      ux *
        dx +
      uy *
        dy
    );

  const coefficientC =
    ux *
      ux +
    uy *
      uy -
    radius *
      radius;


  return {
    A:
      coefficientA,

    B:
      coefficientB,

    C:
      coefficientC,
  };
}


function rationalPolynomialIsNonPositiveV1({
  A,
  B,
  C,
  parameter,
}) {
  const p =
    parameter.numerator;

  const q =
    parameter.denominator;


  const scaledValue =
    A *
      p *
      p +
    B *
      p *
      q +
    C *
      q *
      q;


  return (
    scaledValue <=
    0n
  );
}


function linearRadicalIsNonPositiveV1({
  P,
  Q,
  discriminant,
}) {
  if (
    Q ===
      0n
  ) {
    return (
      P <=
      0n
    );
  }


  const radicalMagnitudeSquared =
    Q *
    Q *
    discriminant;


  if (
    Q >
      0n
  ) {
    /*
     * P + Q*sqrt(D) <= 0
     *
     * Q*sqrt(D) is strictly positive.
     *
     * Therefore P must be negative, then:
     *
     *   Q*sqrt(D) <= -P
     *
     * Squaring both non-negative sides:
     *
     *   Q^2 * D <= P^2
     */
    if (
      P >=
        0n
    ) {
      return false;
    }


    return (
      radicalMagnitudeSquared <=
      P *
      P
    );
  }


  /*
   * Q < 0:
   *
   *   P - |Q|*sqrt(D) <= 0
   *
   * If P <= 0 this is immediately true.
   *
   * Otherwise:
   *
   *   P <= |Q|*sqrt(D)
   *
   * Squaring both positive sides:
   *
   *   P^2 <= Q^2 * D
   */
  if (
    P <=
      0n
  ) {
    return true;
  }


  return (
    P *
      P <=
    radicalMagnitudeSquared
  );
}


function quadraticPolynomialIsNonPositiveV1({
  A,
  B,
  C,
  parameter,
}) {
  const a =
    parameter.a;

  const b =
    parameter.b;

  const discriminant =
    parameter.discriminant;


  /*
   * t =
   *   (-b - sqrt(D)) /
   *   (2a)
   *
   * 4a^2 * F(t) =
   *
   *   P + Q*sqrt(D)
   *
   * Because 4a^2 > 0, sign is preserved.
   */
  const P =
    A *
      (
        b *
          b +
        discriminant
      ) -
    2n *
      a *
      B *
      b +
    4n *
      a *
      a *
      C;

  const Q =
    2n *
    (
      A *
        b -
      a *
        B
    );


  return linearRadicalIsNonPositiveV1({
    P,
    Q,
    discriminant,
  });
}


function affineContactPointInsideCircleV1({
  exactPoint,
  circleCenterXScaled,
  circleCenterYScaled,
  radiusScaled,
} = {}) {
  const point =
    assertExactPoint(
      exactPoint
    );


  const polynomial =
    deriveDistancePolynomialV1({
      point,

      circleCenterXScaled,
      circleCenterYScaled,
      radiusScaled,
    });


  const parameter =
    point.contact_parameter;


  if (
    parameter.kind ===
      CONTACT_PARAMETER_KIND_V1.RATIONAL
  ) {
    return rationalPolynomialIsNonPositiveV1({
      ...polynomial,
      parameter,
    });
  }


  if (
    parameter.kind ===
      CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT
  ) {
    return quadraticPolynomialIsNonPositiveV1({
      ...polynomial,
      parameter,
    });
  }


  throw buildError({
    message:
      "Affine point/circle membership Cing Artillery gặp ContactParameterV1 kind không hỗ trợ",
  });
}


module.exports = {
  affineContactPointInsideCircleV1,
};
