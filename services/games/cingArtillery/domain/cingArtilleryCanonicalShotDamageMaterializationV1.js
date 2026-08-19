"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * CANONICAL SHOT DAMAGE MATERIALIZATION V1
 *
 * Purpose:
 *
 *   compose already-canonical authorities into one
 *   immutable DOMAIN resolution-damage payload.
 *
 * Inputs are already authoritative outputs from:
 *
 *   ShotTrajectorySolverV1
 *   CanonicalShotTargetMaterializationV1
 *   BlastTargetEligibilityV1
 *   ExactBlastDistanceFloorV1
 *   DamageRulesNumericV1
 *   CombatDamageStatBindingV1
 *   BlastRadiusNumericV1
 *
 * Semantics:
 *
 *   player_hit
 *     -> canonical opponent target
 *     -> DIRECT damage
 *
 *   terrain_hit + opponent affected
 *     -> canonical opponent target
 *     -> canonical exact blast-distance floor required
 *     -> BLAST damage
 *
 *   terrain_hit + opponent unaffected
 *     -> target NULL
 *     -> damage 0
 *
 *   out_of_bounds
 *     -> no impact
 *     -> target NULL
 *     -> damage 0
 *
 *   flight_horizon_exhausted
 *     -> no impact
 *     -> target NULL
 *     -> damage 0
 *
 * IMPORTANT:
 *
 *   damage remains BigInt here.
 *
 *   This is NOT a PostgreSQL parameter payload.
 *
 *   BigInt -> PostgreSQL NUMERIC serialization belongs to
 *   the later fenced persistence boundary.
 *
 * This module does NOT:
 *
 *   calculate trajectory
 *   calculate collision
 *   calculate blast eligibility
 *   calculate exact blast distance
 *   derive participant identity
 *   derive combat stats
 *   serialize BigInt for PostgreSQL
 *   mutate HP
 *   write PostgreSQL
 *   complete execution
 *   advance turn
 *   complete combat
 *   emit realtime events
 */

const {
  SHOT_TRAJECTORY_SOLVER_OUTCOME_V1,
} =
  require(
    "./cingArtilleryShotTrajectorySolverV1"
  );

const {
  DAMAGE_MODE_V1,
  calculateDamageFormulaV1,
} =
  require(
    "./cingArtilleryDamageFormulaV1"
  );


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_CANONICAL_SHOT_DAMAGE_MATERIALIZATION_V1",
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
        `Canonical shot damage Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function assertNullableTarget(
  value
) {
  if (
    value !==
      null &&
    (
      typeof value !==
        "string" ||
      value.trim() ===
        ""
    )
  ) {
    throw buildError({
      message:
        "Canonical shot damage Cing Artillery có target_account_id không hợp lệ",
    });
  }

  return value;
}


function assertCanonicalTarget(
  value
) {
  const target =
    assertObject(
      value,
      "canonical_target"
    );

  return assertNullableTarget(
    target.target_account_id
  );
}


function assertCanonicalOpponentBinding(
  value
) {
  const opponent =
    assertObject(
      value,
      "opponent_binding"
    );

  if (
    typeof opponent.opponent_account_id !==
      "string" ||
    opponent.opponent_account_id.trim() ===
      "" ||
    typeof opponent.opponent_session_id !==
      "string" ||
    opponent.opponent_session_id.trim() ===
      ""
  ) {
    throw buildError({
      message:
        "Canonical shot damage Cing Artillery có opponent binding không hợp lệ",
    });
  }

  return opponent;
}


function assertStatIdentityMatchesOpponent({
  statBinding,
  opponentBinding,
}) {
  const stats =
    assertObject(
      statBinding,
      "combat_damage_stat_binding"
    );

  if (
    typeof stats.opponent_account_id !==
      "string" ||
    typeof stats.opponent_session_id !==
      "string" ||
    stats.opponent_account_id !==
      opponentBinding.opponent_account_id ||
    stats.opponent_session_id !==
      opponentBinding.opponent_session_id
  ) {
    throw buildError({
      message:
        "Canonical shot damage Cing Artillery có stat/opponent identity mismatch",
      code:
        "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_STAT_IDENTITY_MISMATCH_V1",
    });
  }

  return stats;
}


function assertCollisionImpact(
  shot
) {
  if (
    shot.exact_impact ===
      null ||
    shot.exact_impact ===
      undefined
  ) {
    throw buildError({
      message:
        "Canonical shot damage Cing Artillery collision thiếu exact impact",
      code:
        "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_EXACT_IMPACT_MISSING_V1",
    });
  }

  const numeric =
    assertObject(
      shot.numeric_impact,
      "numeric_impact"
    );

  if (
    numeric.projection_version !==
      1 ||
    typeof numeric.impact_x !==
      "string" ||
    numeric.impact_x ===
      "" ||
    typeof numeric.impact_y !==
      "string" ||
    numeric.impact_y ===
      ""
  ) {
    throw buildError({
      message:
        "Canonical shot damage Cing Artillery có numeric impact projection không hợp lệ",
      code:
        "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_NUMERIC_IMPACT_INVALID_V1",
    });
  }
}


function assertNoImpact(
  shot
) {
  if (
    shot.exact_impact !==
      null ||
    shot.numeric_impact !==
      null
  ) {
    throw buildError({
      message:
        "Canonical shot damage Cing Artillery no-impact outcome chứa impact",
      code:
        "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_UNEXPECTED_IMPACT_V1",
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
        "Canonical shot damage Cing Artillery yêu cầu opponent_affected boolean",
    });
  }

  return eligibility.opponent_affected;
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
        `Canonical shot damage Cing Artillery không cho blast eligibility với ${outcome}`,
      code:
        "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_UNEXPECTED_BLAST_ELIGIBILITY_V1",
    });
  }
}


function assertNoBlastDistance(
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
        `Canonical shot damage Cing Artillery không cho blast distance với ${outcome}`,
      code:
        "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_UNEXPECTED_BLAST_DISTANCE_V1",
    });
  }
}


function assertBlastDistance(
  value,
  blastRadiusScaled
) {
  const result =
    assertObject(
      value,
      "exact_blast_distance_floor"
    );

  if (
    typeof result.distance_floor_scaled !==
      "bigint" ||
    result.distance_floor_scaled <
      0n ||
    result.distance_floor_scaled >
      blastRadiusScaled
  ) {
    throw buildError({
      message:
        "Canonical shot damage Cing Artillery có exact blast-distance floor không hợp lệ",
      code:
        "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_BLAST_DISTANCE_INVALID_V1",
    });
  }

  return result.distance_floor_scaled;
}


function assertBlastRadius(
  value
) {
  const radius =
    assertObject(
      value,
      "blast_radius_numeric"
    );

  if (
    typeof radius.blast_radius_scaled !==
      "bigint" ||
    radius.blast_radius_scaled <=
      0n
  ) {
    throw buildError({
      message:
        "Canonical shot damage Cing Artillery có blast radius numeric không hợp lệ",
    });
  }

  return radius.blast_radius_scaled;
}


function zeroDamagePayload({
  outcome,
  shot,
}) {
  return Object.freeze({
    outcome,

    exact_impact:
      shot.exact_impact,

    numeric_impact:
      shot.numeric_impact,

    target_account_id:
      null,

    damage:
      0n,

    damage_mode:
      null,

    blast_distance_floor_scaled:
      null,
  });
}


function materializeCanonicalShotDamageV1({
  shotTrajectoryResult,
  canonicalTarget,
  opponentBinding,
  blastTargetEligibility,
  exactBlastDistanceFloor,
  damageRules,
  statBinding,
  blastRadiusNumeric,
} = {}) {
  const shot =
    assertObject(
      shotTrajectoryResult,
      "shot_trajectory_result"
    );

  const targetAccountId =
    assertCanonicalTarget(
      canonicalTarget
    );

  const opponent =
    assertCanonicalOpponentBinding(
      opponentBinding
    );

  const stats =
    assertStatIdentityMatchesOpponent({
      statBinding,
      opponentBinding:
        opponent,
    });

  const outcome =
    shot.outcome;


  if (
    outcome ===
      SHOT_TRAJECTORY_SOLVER_OUTCOME_V1.PLAYER_HIT
  ) {
    assertCollisionImpact(
      shot
    );

    assertNoBlastEligibility(
      blastTargetEligibility,
      outcome
    );

    assertNoBlastDistance(
      exactBlastDistanceFloor,
      outcome
    );

    if (
      targetAccountId !==
        opponent.opponent_account_id
    ) {
      throw buildError({
        message:
          "Canonical shot damage Cing Artillery player_hit phải target canonical opponent",
        code:
          "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_TARGET_MISMATCH_V1",
      });
    }

    const damageResult =
      calculateDamageFormulaV1({
        mode:
          DAMAGE_MODE_V1.DIRECT,

        damageRules,

        statBinding:
          stats,
      });

    return Object.freeze({
      outcome,

      exact_impact:
        shot.exact_impact,

      numeric_impact:
        shot.numeric_impact,

      target_account_id:
        targetAccountId,

      damage:
        damageResult.damage,

      damage_mode:
        DAMAGE_MODE_V1.DIRECT,

      blast_distance_floor_scaled:
        null,
    });
  }


  if (
    outcome ===
      SHOT_TRAJECTORY_SOLVER_OUTCOME_V1.TERRAIN_HIT
  ) {
    assertCollisionImpact(
      shot
    );

    const opponentAffected =
      assertBlastEligibility(
        blastTargetEligibility
      );

    const radius =
      assertBlastRadius(
        blastRadiusNumeric
      );


    if (
      opponentAffected ===
        false
    ) {
      assertNoBlastDistance(
        exactBlastDistanceFloor,
        outcome
      );

      if (
        targetAccountId !==
          null
      ) {
        throw buildError({
          message:
            "Canonical shot damage Cing Artillery terrain miss phải có target NULL",
          code:
            "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_TARGET_MISMATCH_V1",
        });
      }

      return Object.freeze({
        outcome,

        exact_impact:
          shot.exact_impact,

        numeric_impact:
          shot.numeric_impact,

        target_account_id:
          null,

        damage:
          0n,

        damage_mode:
          null,

        blast_distance_floor_scaled:
          null,
      });
    }


    if (
      targetAccountId !==
        opponent.opponent_account_id
    ) {
      throw buildError({
        message:
          "Canonical shot damage Cing Artillery terrain blast phải target canonical opponent",
        code:
          "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_TARGET_MISMATCH_V1",
      });
    }


    const distance =
      assertBlastDistance(
        exactBlastDistanceFloor,
        radius
      );


    const damageResult =
      calculateDamageFormulaV1({
        mode:
          DAMAGE_MODE_V1.BLAST,

        damageRules,

        statBinding:
          stats,

        distanceFloorScaled:
          distance,

        blastRadiusScaled:
          radius,
      });


    return Object.freeze({
      outcome,

      exact_impact:
        shot.exact_impact,

      numeric_impact:
        shot.numeric_impact,

      target_account_id:
        targetAccountId,

      damage:
        damageResult.damage,

      damage_mode:
        DAMAGE_MODE_V1.BLAST,

      blast_distance_floor_scaled:
        distance,
    });
  }


  if (
    outcome ===
      SHOT_TRAJECTORY_SOLVER_OUTCOME_V1.OUT_OF_BOUNDS ||
    outcome ===
      SHOT_TRAJECTORY_SOLVER_OUTCOME_V1.FLIGHT_HORIZON_EXHAUSTED
  ) {
    assertNoImpact(
      shot
    );

    assertNoBlastEligibility(
      blastTargetEligibility,
      outcome
    );

    assertNoBlastDistance(
      exactBlastDistanceFloor,
      outcome
    );

    if (
      targetAccountId !==
        null
    ) {
      throw buildError({
        message:
          "Canonical shot damage Cing Artillery no-impact outcome phải có target NULL",
        code:
          "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_TARGET_MISMATCH_V1",
      });
    }

    return zeroDamagePayload({
      outcome,
      shot,
    });
  }


  throw buildError({
    message:
      "Canonical shot damage Cing Artillery gặp unsupported outcome",
    code:
      "CING_ARTILLERY_CANONICAL_SHOT_DAMAGE_OUTCOME_UNSUPPORTED_V1",
  });
}


module.exports = {
  materializeCanonicalShotDamageV1,
};
