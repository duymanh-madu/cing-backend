"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * BLAST TARGET ELIGIBILITY V1
 *
 * Owns ONLY the gameplay question:
 *
 *   For one canonical terrain_hit,
 *   is the canonical opponent center inside or on
 *   the canonical blast circle centered at the exact
 *   projectile-center impact point?
 *
 * Inputs:
 *
 *   shotTrajectoryResult
 *     must be canonical terrain_hit
 *     must contain exact_impact
 *
 *   opponentCollider
 *     supplies canonical opponent center:
 *
 *       center_x_scaled
 *       center_y_scaled
 *
 *   blastRadiusScaled
 *     exact positive BigInt on physics_fixed_scale
 *
 * Exact geometry is delegated to:
 *
 *   AffineContactPointCircleMembershipV1
 *
 * Semantics:
 *
 *   exact impact inside closed blast circle
 *     -> opponent_affected = true
 *
 *   exact impact outside
 *     -> opponent_affected = false
 *
 * IMPORTANT:
 *
 *   opponentCollider.radius_scaled is intentionally NOT
 *   added to blastRadiusScaled.
 *
 *   Player collider radius belongs to projectile/player
 *   collision geometry.
 *
 *   Blast Target Eligibility V1 models blast distance from
 *   projectile-center impact to canonical opponent center.
 *
 * This module does NOT:
 *
 *   use numeric_impact
 *   approximate exact impact
 *   calculate distance sqrt
 *   calculate blast falloff
 *   calculate damage
 *   choose target_account_id
 *   mutate HP
 *   write PostgreSQL
 *   advance turn
 *   emit realtime events
 */

const {
  SHOT_TRAJECTORY_SOLVER_OUTCOME_V1,
} =
  require(
    "./cingArtilleryShotTrajectorySolverV1"
  );

const {
  affineContactPointInsideCircleV1,
} =
  require(
    "./cingArtilleryAffineContactPointCircleMembershipV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_BLAST_TARGET_ELIGIBILITY_V1",
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
        `Blast target eligibility Cing Artillery không hợp lệ: ${field}`,
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
        `Blast target eligibility Cing Artillery yêu cầu ${field} là BigInt`,
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
        `Blast target eligibility Cing Artillery yêu cầu ${field} > 0`,
    });
  }


  return normalized;
}


function classifyBlastTargetEligibilityV1({
  shotTrajectoryResult,
  opponentCollider,
  blastRadiusScaled,
} = {}) {
  const shot =
    assertObject(
      shotTrajectoryResult,
      "shot_trajectory_result"
    );


  if (
    shot.outcome !==
      SHOT_TRAJECTORY_SOLVER_OUTCOME_V1.TERRAIN_HIT
  ) {
    throw buildError({
      message:
        "Blast target eligibility Cing Artillery chỉ hỗ trợ terrain_hit",
      code:
        "CING_ARTILLERY_BLAST_TARGET_ELIGIBILITY_REQUIRES_TERRAIN_HIT_V1",
    });
  }


  if (
    shot.exact_impact ===
      null ||
    shot.exact_impact ===
      undefined
  ) {
    throw buildError({
      message:
        "Blast target eligibility Cing Artillery terrain_hit thiếu exact impact",
      code:
        "CING_ARTILLERY_BLAST_TARGET_ELIGIBILITY_EXACT_IMPACT_MISSING_V1",
    });
  }


  const collider =
    assertObject(
      opponentCollider,
      "opponent_collider"
    );


  const centerX =
    assertBigInt(
      collider.center_x_scaled,
      "opponent_collider.center_x_scaled"
    );

  const centerY =
    assertBigInt(
      collider.center_y_scaled,
      "opponent_collider.center_y_scaled"
    );

  const radius =
    assertPositiveBigInt(
      blastRadiusScaled,
      "blast_radius_scaled"
    );


  const affected =
    affineContactPointInsideCircleV1({
      exactPoint:
        shot.exact_impact,

      circleCenterXScaled:
        centerX,

      circleCenterYScaled:
        centerY,

      radiusScaled:
        radius,
    });


  return Object.freeze({
    opponent_affected:
      affected,
  });
}


module.exports = {
  classifyBlastTargetEligibilityV1,
};
