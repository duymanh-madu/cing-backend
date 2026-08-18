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


const AFFINE_CONTACT_POINT_CIRCLE_RELATION_V1 =
  Object.freeze({
    INSIDE:
      "inside",

    TANGENT:
      "tangent",

    OUTSIDE:
      "outside",
  });


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


function compareRationalPolynomialToZeroV1({
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


  if (
    scaledValue <
      0n
  ) {
    return -1;
  }


  if (
    scaledValue >
      0n
  ) {
    return 1;
  }


  return 0;
}


function compareLinearRadicalToZeroV1({
  P,
  Q,
  discriminant,
}) {
  if (
    Q ===
      0n
  ) {
    if (
      P <
        0n
    ) {
      return -1;
    }

    if (
      P >
        0n
    ) {
      return 1;
    }

    return 0;
  }


  const radicalMagnitudeSquared =
    Q *
    Q *
    discriminant;


  if (
    Q >
      0n
  ) {
    if (
      P >=
        0n
    ) {
      return 1;
    }


    const rationalMagnitudeSquared =
      P *
      P;


    if (
      radicalMagnitudeSquared <
        rationalMagnitudeSquared
    ) {
      return -1;
    }


    if (
      radicalMagnitudeSquared >
        rationalMagnitudeSquared
    ) {
      return 1;
    }


    return 0;
  }


  if (
    P <=
      0n
  ) {
    return -1;
  }


  const rationalMagnitudeSquared =
    P *
    P;


  if (
    rationalMagnitudeSquared <
      radicalMagnitudeSquared
  ) {
    return -1;
  }


  if (
    rationalMagnitudeSquared >
      radicalMagnitudeSquared
  ) {
    return 1;
  }


  return 0;
}


function compareQuadraticPolynomialToZeroV1({
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


  return compareLinearRadicalToZeroV1({
    P,
    Q,
    discriminant,
  });
}


function classifyAffineContactPointCircleRelationV1({
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


  let comparison;


  if (
    parameter.kind ===
      CONTACT_PARAMETER_KIND_V1.RATIONAL
  ) {
    comparison =
      compareRationalPolynomialToZeroV1({
        ...polynomial,
        parameter,
      });
  } else if (
    parameter.kind ===
      CONTACT_PARAMETER_KIND_V1.QUADRATIC_LOWER_ROOT
  ) {
    comparison =
      compareQuadraticPolynomialToZeroV1({
        ...polynomial,
        parameter,
      });
  } else {
    throw buildError({
      message:
        "Affine point/circle relation Cing Artillery gặp ContactParameterV1 kind không hỗ trợ",
    });
  }


  if (
    comparison <
      0
  ) {
    return AFFINE_CONTACT_POINT_CIRCLE_RELATION_V1.INSIDE;
  }


  if (
    comparison >
      0
  ) {
    return AFFINE_CONTACT_POINT_CIRCLE_RELATION_V1.OUTSIDE;
  }


  return AFFINE_CONTACT_POINT_CIRCLE_RELATION_V1.TANGENT;
}


function affineContactPointInsideCircleV1({
  exactPoint,
  circleCenterXScaled,
  circleCenterYScaled,
  radiusScaled,
} = {}) {
  return (
    classifyAffineContactPointCircleRelationV1({
      exactPoint,
      circleCenterXScaled,
      circleCenterYScaled,
      radiusScaled,
    }) !==
    AFFINE_CONTACT_POINT_CIRCLE_RELATION_V1.OUTSIDE
  );
}


module.exports = {
  AFFINE_CONTACT_POINT_CIRCLE_RELATION_V1,
  classifyAffineContactPointCircleRelationV1,
  affineContactPointInsideCircleV1,
};
