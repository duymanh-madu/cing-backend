"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * EXACT BLAST DISTANCE FLOOR V1
 *
 * Purpose:
 *
 *   Compute:
 *
 *     floor(
 *       exact Euclidean distance between
 *       exact affine projectile-center impact
 *       and one fixed target center
 *     )
 *
 *   in canonical fixed-point lattice units.
 *
 * The exact impact may be rational or quadratic irrational.
 *
 * No coordinate projection and no numerical square root
 * is performed.
 *
 * Authority dependency:
 *
 *   AffineContactPointCircleRelationV1
 *
 * Search contract:
 *
 *   caller supplies blastRadiusScaled as one exact positive
 *   integer upper bound.
 *
 *   The exact impact MUST be inside or tangent to that
 *   radius. If it is outside, this primitive fails closed.
 *
 * We find the smallest positive integer radius R for which:
 *
 *   distance <= R
 *
 * Then:
 *
 *   relation(R) = tangent
 *     -> distance = R
 *     -> floor(distance) = R
 *
 *   relation(R) = inside
 *     -> distance < R
 *     -> because R is the smallest positive integer with
 *        distance <= R:
 *
 *          R - 1 < distance < R
 *
 *        except R = 1 also naturally covers:
 *
 *          0 <= distance < 1
 *
 *     -> floor(distance) = R - 1
 *
 * Binary search is exact BigInt and monotonic:
 *
 *   outside => distance > radius
 *   tangent => distance = radius
 *   inside  => distance < radius
 *
 * This module does NOT:
 *
 *   calculate blast eligibility policy
 *   read numeric_impact
 *   calculate sqrt
 *   convert to Number
 *   calculate damage
 *   apply ATK/DEF
 *   materialize target identity
 *   mutate HP
 *   write PostgreSQL
 *   emit realtime events
 */

const {
  AFFINE_CONTACT_POINT_CIRCLE_RELATION_V1,
  classifyAffineContactPointCircleRelationV1,
} =
  require(
    "./cingArtilleryAffineContactPointCircleMembershipV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_EXACT_BLAST_DISTANCE_FLOOR_V1",
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
        `Exact blast distance Cing Artillery yêu cầu ${field} là BigInt`,
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
        `Exact blast distance Cing Artillery yêu cầu ${field} > 0`,
    });
  }


  return normalized;
}


function classifyAtRadius({
  exactImpact,
  targetCenterXScaled,
  targetCenterYScaled,
  radiusScaled,
}) {
  return classifyAffineContactPointCircleRelationV1({
    exactPoint:
      exactImpact,

    circleCenterXScaled:
      targetCenterXScaled,

    circleCenterYScaled:
      targetCenterYScaled,

    radiusScaled,
  });
}


function calculateExactBlastDistanceFloorV1({
  exactImpact,
  targetCenterXScaled,
  targetCenterYScaled,
  blastRadiusScaled,
} = {}) {
  const centerX =
    assertBigInt(
      targetCenterXScaled,
      "target_center_x_scaled"
    );

  const centerY =
    assertBigInt(
      targetCenterYScaled,
      "target_center_y_scaled"
    );

  const upperBound =
    assertPositiveBigInt(
      blastRadiusScaled,
      "blast_radius_scaled"
    );


  const upperRelation =
    classifyAtRadius({
      exactImpact,

      targetCenterXScaled:
        centerX,

      targetCenterYScaled:
        centerY,

      radiusScaled:
        upperBound,
    });


  if (
    upperRelation ===
      AFFINE_CONTACT_POINT_CIRCLE_RELATION_V1.OUTSIDE
  ) {
    throw buildError({
      message:
        "Exact blast distance Cing Artillery vượt quá canonical blast radius",
      code:
        "CING_ARTILLERY_EXACT_BLAST_DISTANCE_OUTSIDE_RADIUS_V1",
    });
  }


  let low =
    1n;

  let high =
    upperBound;


  while (
    low <
      high
  ) {
    const midpoint =
      low +
      (
        high -
        low
      ) /
        2n;


    const relation =
      classifyAtRadius({
        exactImpact,

        targetCenterXScaled:
          centerX,

        targetCenterYScaled:
          centerY,

        radiusScaled:
          midpoint,
      });


    if (
      relation ===
        AFFINE_CONTACT_POINT_CIRCLE_RELATION_V1.OUTSIDE
    ) {
      low =
        midpoint +
        1n;
    } else {
      high =
        midpoint;
    }
  }


  const ceilingDistance =
    low;


  const terminalRelation =
    classifyAtRadius({
      exactImpact,

      targetCenterXScaled:
        centerX,

      targetCenterYScaled:
        centerY,

      radiusScaled:
        ceilingDistance,
    });


  let distanceFloor;


  if (
    terminalRelation ===
      AFFINE_CONTACT_POINT_CIRCLE_RELATION_V1.TANGENT
  ) {
    distanceFloor =
      ceilingDistance;
  } else if (
    terminalRelation ===
      AFFINE_CONTACT_POINT_CIRCLE_RELATION_V1.INSIDE
  ) {
    distanceFloor =
      ceilingDistance -
      1n;
  } else {
    throw buildError({
      message:
        "Exact blast distance Cing Artillery có binary-search invariant không hợp lệ",
      code:
        "CING_ARTILLERY_EXACT_BLAST_DISTANCE_SEARCH_INVARIANT_V1",
    });
  }


  if (
    distanceFloor <
      0n ||
    distanceFloor >
      upperBound
  ) {
    throw buildError({
      message:
        "Exact blast distance Cing Artillery tạo floor ngoài canonical range",
      code:
        "CING_ARTILLERY_EXACT_BLAST_DISTANCE_RESULT_INVALID_V1",
    });
  }


  return Object.freeze({
    distance_floor_scaled:
      distanceFloor,
  });
}


module.exports = {
  calculateExactBlastDistanceFloorV1,
};
