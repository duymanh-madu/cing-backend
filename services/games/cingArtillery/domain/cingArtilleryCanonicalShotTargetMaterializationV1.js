"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * CANONICAL SHOT TARGET MATERIALIZATION V1
 *
 * Owns ONLY conversion from already-authoritative
 * shot outcome semantics into durable target identity.
 *
 * Inputs:
 *
 *   shotTrajectoryResult
 *     canonical ShotTrajectorySolverV1 outcome
 *
 *   opponentBinding
 *     canonical CanonicalOpponentBindingV1 output
 *
 *   blastTargetEligibility
 *     required ONLY for terrain_hit
 *
 * Semantics:
 *
 *   player_hit
 *     -> canonical opponent
 *
 *   terrain_hit + opponent_affected = true
 *     -> canonical opponent
 *
 *   terrain_hit + opponent_affected = false
 *     -> null
 *
 *   out_of_bounds
 *     -> null
 *
 *   flight_horizon_exhausted
 *     -> null
 *
 * IMPORTANT:
 *
 *   This module does NOT calculate blast eligibility.
 *
 *   It does NOT inspect:
 *
 *     exact_impact
 *     numeric_impact
 *     opponent collider
 *     blast radius
 *
 *   It does NOT calculate damage.
 *
 * PostgreSQL fenced resolution commit must later
 * independently revalidate canonical target authority
 * before durable mutation.
 *
 * This module does NOT:
 *
 *   calculate geometry
 *   calculate blast membership
 *   calculate damage
 *   mutate HP
 *   write PostgreSQL
 *   complete shot execution
 *   advance turn
 *   terminalize combat
 *   emit realtime events
 */

const {
  SHOT_TRAJECTORY_SOLVER_OUTCOME_V1,
} =
  require(
    "./cingArtilleryShotTrajectorySolverV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_CANONICAL_SHOT_TARGET_MATERIALIZATION_V1",
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
        `Canonical shot target Cing Artillery không hợp lệ: ${field}`,
    });
  }


  return value;
}


function assertNonEmptyString(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||
    value.trim() ===
      ""
  ) {
    throw buildError({
      message:
        `Canonical shot target Cing Artillery yêu cầu ${field} hợp lệ`,
    });
  }


  return value;
}


function assertCanonicalOpponentBinding(
  value
) {
  const binding =
    assertObject(
      value,
      "opponent_binding"
    );


  return {
    opponent_account_id:
      assertNonEmptyString(
        binding.opponent_account_id,
        "opponent_account_id"
      ),

    opponent_session_id:
      assertNonEmptyString(
        binding.opponent_session_id,
        "opponent_session_id"
      ),
  };
}


function assertNoBlastEligibility(
  value,
  outcome
) {
  if (
    value !==
      null &&
    value !==
      undefined
  ) {
    throw buildError({
      message:
        `Canonical shot target Cing Artillery không cho phép blast eligibility với outcome ${outcome}`,
      code:
        "CING_ARTILLERY_CANONICAL_SHOT_TARGET_UNEXPECTED_BLAST_ELIGIBILITY_V1",
    });
  }
}


function assertBlastEligibility(
  value
) {
  const eligibility =
    assertObject(
      value,
      "blast_target_eligibility"
    );


  if (
    typeof eligibility.opponent_affected !==
      "boolean"
  ) {
    throw buildError({
      message:
        "Canonical shot target Cing Artillery yêu cầu opponent_affected boolean",
      code:
        "CING_ARTILLERY_CANONICAL_SHOT_TARGET_BLAST_ELIGIBILITY_INVALID_V1",
    });
  }


  return eligibility.opponent_affected;
}


function materializeCanonicalShotTargetV1({
  shotTrajectoryResult,
  opponentBinding,
  blastTargetEligibility,
} = {}) {
  const shot =
    assertObject(
      shotTrajectoryResult,
      "shot_trajectory_result"
    );


  const opponent =
    assertCanonicalOpponentBinding(
      opponentBinding
    );


  if (
    shot.outcome ===
      SHOT_TRAJECTORY_SOLVER_OUTCOME_V1.PLAYER_HIT
  ) {
    assertNoBlastEligibility(
      blastTargetEligibility,
      shot.outcome
    );


    return Object.freeze({
      target_account_id:
        opponent.opponent_account_id,
    });
  }


  if (
    shot.outcome ===
      SHOT_TRAJECTORY_SOLVER_OUTCOME_V1.TERRAIN_HIT
  ) {
    const opponentAffected =
      assertBlastEligibility(
        blastTargetEligibility
      );


    return Object.freeze({
      target_account_id:
        opponentAffected
          ? opponent.opponent_account_id
          : null,
    });
  }


  if (
    shot.outcome ===
      SHOT_TRAJECTORY_SOLVER_OUTCOME_V1.OUT_OF_BOUNDS ||
    shot.outcome ===
      SHOT_TRAJECTORY_SOLVER_OUTCOME_V1.FLIGHT_HORIZON_EXHAUSTED
  ) {
    assertNoBlastEligibility(
      blastTargetEligibility,
      shot.outcome
    );


    return Object.freeze({
      target_account_id:
        null,
    });
  }


  throw buildError({
    message:
      "Canonical shot target Cing Artillery gặp shot outcome không hỗ trợ",
    code:
      "CING_ARTILLERY_CANONICAL_SHOT_TARGET_OUTCOME_UNSUPPORTED_V1",
  });
}


module.exports = {
  materializeCanonicalShotTargetV1,
};
