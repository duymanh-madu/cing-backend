"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * IMPACT NUMERIC PROJECTION V1
 *
 * Canonical collision truth remains:
 *
 *   exact SegmentContactPointV1.
 *
 * This module creates only the deterministic compatibility
 * projection required by durable impact_x / impact_y.
 *
 * Projection V1:
 *
 *   unit:
 *     solver-space coordinate
 *
 *   decimal quantum:
 *     1e-12
 *
 *   rounding:
 *     nearest
 *
 *   exact ties:
 *     away from zero
 *
 *   transport:
 *     canonical plain decimal string
 *
 * Exact algorithm:
 *
 *   projected coordinate =
 *
 *     (
 *       start_scaled +
 *       delta_scaled * exact_contact_parameter
 *     )
 *     /
 *     physics_fixed_scale
 *
 * The nearest 1e-12 lattice point is selected entirely by
 * exact BigInt / ContactParameterV1 comparisons.
 *
 * No floating-point approximation and no square root is
 * required, including for irrational quadratic contacts.
 *
 * This module does NOT:
 *
 *   calculate collision
 *   calculate contact parameter
 *   mutate exact impact
 *   use Math.sqrt
 *   use Number arithmetic for geometry
 *   write PostgreSQL
 *   calculate damage
 *   mutate HP
 *   emit realtime events
 */

const {
  SEGMENT_CONTACT_POINT_KIND_V1,
} =
  require(
    "./cingArtillerySegmentContactPointV1"
  );

const {
  createRationalContactParameterV1,
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

const {
  MAX_SAFE_SCALED_MAGNITUDE,
  absBigInt,
  floorDivBigInt,
} =
  require(
    "./cingArtilleryFixedPoint"
  );


const IMPACT_NUMERIC_PROJECTION_V1 =
  Object.freeze({
    VERSION:
      1,

    DECIMAL_PLACES:
      12,

    DECIMAL_SCALE:
      1000000000000n,
  });


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_IMPACT_NUMERIC_PROJECTION_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function assertPhysicsFixedScale(
  value
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
        "Impact numeric projection Cing Artillery có physics_fixed_scale không hợp lệ",
    });
  }


  return BigInt(
    value
  );
}


function assertCanonicalContactParameter(
  value
) {
  try {
    compareContactParametersV1(
      value,
      value
    );
  } catch (error) {
    if (
      error &&
      (
        error.code ===
          "CING_ARTILLERY_INVALID_CONTACT_PARAMETER_COMPARATOR_V1" ||
        error.code ===
          "CING_ARTILLERY_NON_CANONICAL_CONTACT_PARAMETER_V1"
      )
    ) {
      throw buildError({
        message:
          "Impact numeric projection Cing Artillery có contact parameter không canonical",
      });
    }


    throw error;
  }


  return value;
}


function assertAffineCoordinate(
  value,
  field
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value) ||
    value.kind !==
      SEGMENT_CONTACT_POINT_KIND_V1.COORDINATE ||
    typeof value.start_scaled !==
      "bigint" ||
    typeof value.delta_scaled !==
      "bigint"
  ) {
    throw buildError({
      message:
        `Impact numeric projection Cing Artillery có ${field} không hợp lệ`,
    });
  }


  if (
    absBigInt(
      value.start_scaled
    ) >
      MAX_SAFE_SCALED_MAGNITUDE ||
    absBigInt(
      value.delta_scaled
    ) >
      MAX_SAFE_SCALED_MAGNITUDE
  ) {
    throw buildError({
      message:
        `Impact numeric projection Cing Artillery có ${field} vượt miền durable scaled V1`,
    });
  }


  assertCanonicalContactParameter(
    value.contact_parameter
  );


  return value;
}


function assertExactImpactPoint(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value) ||
    value.kind !==
      SEGMENT_CONTACT_POINT_KIND_V1.POINT
  ) {
    throw buildError({
      message:
        "Impact numeric projection Cing Artillery có exact impact point không hợp lệ",
    });
  }


  const xCoordinate =
    assertAffineCoordinate(
      value.x_coordinate,
      "x_coordinate"
    );

  const yCoordinate =
    assertAffineCoordinate(
      value.y_coordinate,
      "y_coordinate"
    );


  if (
    xCoordinate.contact_parameter !==
      yCoordinate.contact_parameter
  ) {
    throw buildError({
      message:
        "Impact numeric projection Cing Artillery yêu cầu X/Y dùng cùng exact contact parameter",
    });
  }


  return {
    xCoordinate,
    yCoordinate,
  };
}


/*
 * Compare the exact scaled affine coordinate:
 *
 *   start + delta * t
 *
 * against the exact rational scaled-space threshold:
 *
 *   thresholdNumerator / thresholdDenominator
 *
 * Returns:
 *
 *   -1  coordinate < threshold
 *    0  coordinate = threshold
 *    1  coordinate > threshold
 */
function compareAffineScaledCoordinateToRationalV1({
  coordinate,
  thresholdNumerator,
  thresholdDenominator,
}) {
  if (
    typeof thresholdNumerator !==
      "bigint" ||
    typeof thresholdDenominator !==
      "bigint" ||
    thresholdDenominator <=
      0n
  ) {
    throw buildError({
      message:
        "Impact numeric projection Cing Artillery có rational threshold không hợp lệ",
    });
  }


  const start =
    coordinate.start_scaled;

  const delta =
    coordinate.delta_scaled;

  const end =
    start +
    delta;


  const startCross =
    start *
    thresholdDenominator;

  const endCross =
    end *
    thresholdDenominator;


  if (
    delta ===
      0n
  ) {
    if (
      startCross <
        thresholdNumerator
    ) {
      return -1;
    }

    if (
      startCross >
        thresholdNumerator
    ) {
      return 1;
    }

    return 0;
  }


  if (
    delta >
      0n
  ) {
    if (
      thresholdNumerator <=
        startCross
    ) {
      return thresholdNumerator ===
        startCross
        ? compareContactParametersV1(
            coordinate.contact_parameter,
            createRationalContactParameterV1({
              numerator:
                0n,

              denominator:
                1n,
            })
          )
        : 1;
    }


    if (
      thresholdNumerator >=
        endCross
    ) {
      return thresholdNumerator ===
        endCross
        ? compareContactParametersV1(
            coordinate.contact_parameter,
            createRationalContactParameterV1({
              numerator:
                1n,

              denominator:
                1n,
            })
          )
        : -1;
    }


    const thresholdParameter =
      createRationalContactParameterV1({
        numerator:
          thresholdNumerator -
          startCross,

        denominator:
          delta *
          thresholdDenominator,
      });


    return compareContactParametersV1(
      coordinate.contact_parameter,
      thresholdParameter
    );
  }


  if (
    thresholdNumerator >=
      startCross
  ) {
    return thresholdNumerator ===
      startCross
      ? -compareContactParametersV1(
          coordinate.contact_parameter,
          createRationalContactParameterV1({
            numerator:
              0n,

            denominator:
              1n,
          })
        )
      : -1;
  }


  if (
    thresholdNumerator <=
      endCross
  ) {
    return thresholdNumerator ===
      endCross
      ? -compareContactParametersV1(
          coordinate.contact_parameter,
          createRationalContactParameterV1({
            numerator:
              1n,

            denominator:
              1n,
          })
        )
      : 1;
  }


  const thresholdParameter =
    createRationalContactParameterV1({
      numerator:
        startCross -
        thresholdNumerator,

      denominator:
        (-delta) *
        thresholdDenominator,
    });


  return -compareContactParametersV1(
    coordinate.contact_parameter,
    thresholdParameter
  );
}


/*
 * Compare:
 *
 *   exact solver coordinate * DECIMAL_SCALE
 *
 * against an integer quantum index.
 */
function compareProjectedQuantumCoordinateToIntegerV1({
  coordinate,
  physicsScaleBigInt,
  integerQuantum,
}) {
  return compareAffineScaledCoordinateToRationalV1({
    coordinate,

    thresholdNumerator:
      integerQuantum *
      physicsScaleBigInt,

    thresholdDenominator:
      IMPACT_NUMERIC_PROJECTION_V1.DECIMAL_SCALE,
  });
}


/*
 * Determine:
 *
 *   floor(
 *     exact_solver_coordinate * 1e12
 *   )
 *
 * exactly.
 */
function deriveProjectedQuantumFloorV1({
  coordinate,
  physicsScaleBigInt,
}) {
  const decimalScale =
    IMPACT_NUMERIC_PROJECTION_V1.DECIMAL_SCALE;

  const startQuantumFloor =
    floorDivBigInt(
      coordinate.start_scaled *
        decimalScale,
      physicsScaleBigInt
    );

  const endScaled =
    coordinate.start_scaled +
    coordinate.delta_scaled;

  const endQuantumFloor =
    floorDivBigInt(
      endScaled *
        decimalScale,
      physicsScaleBigInt
    );


  let low =
    startQuantumFloor <
      endQuantumFloor
      ? startQuantumFloor
      : endQuantumFloor;

  let high =
    (
      startQuantumFloor >
        endQuantumFloor
        ? startQuantumFloor
        : endQuantumFloor
    ) +
    1n;


  while (
    high -
      low >
    1n
  ) {
    const middle =
      floorDivBigInt(
        low +
          high,
        2n
      );


    const comparison =
      compareProjectedQuantumCoordinateToIntegerV1({
        coordinate,
        physicsScaleBigInt,
        integerQuantum:
          middle,
      });


    if (
      comparison >=
        0
    ) {
      low =
        middle;
    } else {
      high =
        middle;
    }
  }


  return low;
}


/*
 * nearest rounding with exact half ties away from zero.
 */
function deriveRoundedProjectedQuantumV1({
  coordinate,
  physicsScaleBigInt,
}) {
  const floorQuantum =
    deriveProjectedQuantumFloorV1({
      coordinate,
      physicsScaleBigInt,
    });


  const halfThresholdNumerator =
    (
      2n *
      floorQuantum +
      1n
    ) *
    physicsScaleBigInt;

  const halfThresholdDenominator =
    2n *
    IMPACT_NUMERIC_PROJECTION_V1.DECIMAL_SCALE;


  const halfComparison =
    compareAffineScaledCoordinateToRationalV1({
      coordinate,

      thresholdNumerator:
        halfThresholdNumerator,

      thresholdDenominator:
        halfThresholdDenominator,
    });


  if (
    halfComparison <
      0
  ) {
    return floorQuantum;
  }


  if (
    halfComparison >
      0
  ) {
    return floorQuantum +
      1n;
  }


  /*
   * Exact midpoint.
   *
   * floor >= 0:
   *
   *   midpoint is positive
   *   -> away from zero = upper integer
   *
   * floor < 0:
   *
   *   midpoint is negative
   *   -> away from zero = lower integer
   */
  return floorQuantum >=
    0n
    ? floorQuantum +
        1n
    : floorQuantum;
}


function serializeProjectedQuantumV1(
  quantum
) {
  if (
    typeof quantum !==
      "bigint"
  ) {
    throw buildError({
      message:
        "Impact numeric projection Cing Artillery có quantum không hợp lệ",
    });
  }


  if (
    quantum ===
      0n
  ) {
    return "0";
  }


  const negative =
    quantum <
      0n;

  const magnitude =
    negative
      ? -quantum
      : quantum;

  const decimalScale =
    IMPACT_NUMERIC_PROJECTION_V1.DECIMAL_SCALE;


  const integerPart =
    magnitude /
    decimalScale;

  const fractionalPart =
    magnitude %
    decimalScale;


  if (
    fractionalPart ===
      0n
  ) {
    return `${
      negative
        ? "-"
        : ""
    }${integerPart.toString()}`;
  }


  const fractionalText =
    fractionalPart
      .toString()
      .padStart(
        IMPACT_NUMERIC_PROJECTION_V1.DECIMAL_PLACES,
        "0"
      )
      .replace(
        /0+$/,
        ""
      );


  return `${
    negative
      ? "-"
      : ""
  }${integerPart.toString()}.${fractionalText}`;
}


function projectAffineContactCoordinateToNumericV1({
  coordinate,
  physicsFixedScale,
} = {}) {
  const canonicalCoordinate =
    assertAffineCoordinate(
      coordinate,
      "coordinate"
    );

  const physicsScaleBigInt =
    assertPhysicsFixedScale(
      physicsFixedScale
    );


  const quantum =
    deriveRoundedProjectedQuantumV1({
      coordinate:
        canonicalCoordinate,

      physicsScaleBigInt,
    });


  return serializeProjectedQuantumV1(
    quantum
  );
}


function projectImpactNumericV1({
  exactImpactPoint,
  physicsFixedScale,
} = {}) {
  const {
    xCoordinate,
    yCoordinate,
  } =
    assertExactImpactPoint(
      exactImpactPoint
    );

  const physicsScaleBigInt =
    assertPhysicsFixedScale(
      physicsFixedScale
    );


  const xQuantum =
    deriveRoundedProjectedQuantumV1({
      coordinate:
        xCoordinate,

      physicsScaleBigInt,
    });


  const yQuantum =
    deriveRoundedProjectedQuantumV1({
      coordinate:
        yCoordinate,

      physicsScaleBigInt,
    });


  return Object.freeze({
    projection_version:
      IMPACT_NUMERIC_PROJECTION_V1.VERSION,

    impact_x:
      serializeProjectedQuantumV1(
        xQuantum
      ),

    impact_y:
      serializeProjectedQuantumV1(
        yQuantum
      ),
  });
}


module.exports = {
  IMPACT_NUMERIC_PROJECTION_V1,

  compareAffineScaledCoordinateToRationalV1,

  deriveProjectedQuantumFloorV1,

  deriveRoundedProjectedQuantumV1,

  serializeProjectedQuantumV1,

  projectAffineContactCoordinateToNumericV1,

  projectImpactNumericV1,
};
