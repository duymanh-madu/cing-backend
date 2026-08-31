"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * SHOT EXECUTION PROCESSOR V1
 *
 * Responsibility:
 *
 *   live execution claim
 *   -> PostgreSQL mutable execution context
 *   -> deterministic Node physics
 *   -> existing fenced PostgreSQL settlement
 *
 * Mutable geometry authority comes ONLY from the execution
 * context RPC.
 *
 * Immutable combat-world spawn coordinates are not read here.
 *
 * This processor deliberately does NOT:
 *
 *   claim work
 *   release/retry work
 *   schedule itself
 *   own feature gates
 *   mutate HP/terrain/turn directly
 */

const executionRepository =
  require(
    "../repositories/cingArtilleryShotExecutionRepository"
  );

const combatStateService =
  require(
    "./cingArtilleryCombatStateService"
  );

const turnStateService =
  require(
    "./cingArtilleryTurnStateService"
  );

const {
  toScaledBigInt,
} = require(
  "../domain/cingArtilleryFixedPoint"
);

const {
  deriveMuzzleOriginV1,
} = require(
  "../domain/cingArtilleryMuzzleOriginV1"
);

const {
  deriveLaunchVectorV1,
} = require(
  "../domain/cingArtilleryLaunchVectorV1"
);

const {
  deriveInitialVelocityV1,
} = require(
  "../domain/cingArtilleryInitialVelocityV1"
);

const {
  normalizeAccelerationRulesV1,
} = require(
  "../domain/cingArtilleryAccelerationNumericV1"
);

const {
  mapWorldAccelerationV1,
} = require(
  "../domain/cingArtilleryPhysicsSemanticContractV1"
);

const {
  deriveMutableOpponentBindingV1,
} = require(
  "../domain/cingArtilleryMutableOpponentBindingV1"
);

const {
  solveShotTrajectoryV1,
  SHOT_TRAJECTORY_SOLVER_OUTCOME_V1,
} = require(
  "../domain/cingArtilleryShotTrajectorySolverV1"
);

const {
  normalizeBlastRadiusNumericV1,
} = require(
  "../domain/cingArtilleryBlastRadiusNumericV1"
);

const {
  classifyBlastTargetEligibilityV1,
} = require(
  "../domain/cingArtilleryBlastTargetEligibilityV1"
);

const {
  calculateExactBlastDistanceFloorV1,
} = require(
  "../domain/cingArtilleryExactBlastDistanceFloorV1"
);

const {
  materializeCanonicalShotTargetV1,
} = require(
  "../domain/cingArtilleryCanonicalShotTargetMaterializationV1"
);

const {
  deriveCombatDamageStatBindingV1,
} = require(
  "../domain/cingArtilleryCombatDamageStatBindingV1"
);

const {
  materializeCanonicalShotDamageV1,
} = require(
  "../domain/cingArtilleryCanonicalShotDamageMaterializationV1"
);

const {
  projectResolutionPersistenceV1,
} = require(
  "../domain/cingArtilleryResolutionPersistenceProjectionV1"
);

const {
  projectTrajectoryPresentationPersistenceV1,
} = require(
  "../domain/cingArtilleryTrajectoryPresentationPersistenceV1"
);


function buildError({
  message,
  code =
    "CING_ARTILLERY_SHOT_EXECUTION_PROCESSOR_INVALID_V1",
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
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw buildError({
      message:
        `Shot execution processor Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}


function identity(
  value,
  field
) {
  const normalized =
    String(value || "")
      .trim()
      .toLowerCase();

  if (!normalized) {
    throw buildError({
      message:
        `Shot execution processor Cing Artillery thiếu ${field}`,
    });
  }

  return normalized;
}


function integerNumber(
  value,
  field
) {
  const normalized =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isSafeInteger(normalized)
  ) {
    throw buildError({
      message:
        `Shot execution processor Cing Artillery yêu cầu ${field} là safe integer`,
    });
  }

  return normalized;
}


function nonNegativeIntegerNumber(
  value,
  field
) {
  const normalized =
    integerNumber(
      value,
      field
    );

  if (normalized < 0) {
    throw buildError({
      message:
        `Shot execution processor Cing Artillery yêu cầu ${field} >= 0`,
    });
  }

  return normalized;
}


function positiveIntegerNumber(
  value,
  field
) {
  const normalized =
    integerNumber(
      value,
      field
    );

  if (normalized <= 0) {
    throw buildError({
      message:
        `Shot execution processor Cing Artillery yêu cầu ${field} > 0`,
    });
  }

  return normalized;
}


function finiteNumber(
  value,
  field
) {
  const normalized =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isFinite(normalized)
  ) {
    throw buildError({
      message:
        `Shot execution processor Cing Artillery yêu cầu ${field} hữu hạn`,
    });
  }

  return normalized;
}


function exactBigInt(
  value,
  field
) {
  if (
    typeof value === "bigint"
  ) {
    return value;
  }

  if (
    typeof value === "number"
  ) {
    if (
      !Number.isSafeInteger(value)
    ) {
      throw buildError({
        message:
          `Shot execution processor Cing Artillery mất precision tại ${field}`,
      });
    }

    return BigInt(value);
  }

  if (
    typeof value === "string" &&
    /^-?(0|[1-9][0-9]*)$/u
      .test(value)
  ) {
    return BigInt(value);
  }

  throw buildError({
    message:
      `Shot execution processor Cing Artillery yêu cầu ${field} là canonical integer`,
  });
}


function collisionMaskFromHex(
  value
) {
  const hex =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    !hex ||
    (hex.length % 2) !== 0 ||
    !/^[0-9a-f]+$/u.test(hex)
  ) {
    throw buildError({
      message:
        "Shot execution processor Cing Artillery có collision_mask_hex không hợp lệ",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_COLLISION_MASK_INVALID_V1",
    });
  }

  return Buffer.from(
    hex,
    "hex"
  );
}


function assertContextIdentity({
  context,
  combatState,
  turnState,
}) {
  if (
    identity(
      combatState.id,
      "combat_state.id"
    ) !==
      identity(
        context.combat_state_id,
        "context.combat_state_id"
      ) ||
    identity(
      combatState.match_runtime_id,
      "combat_state.match_runtime_id"
    ) !==
      identity(
        context.match_runtime_id,
        "context.match_runtime_id"
      ) ||
    identity(
      combatState.match_id,
      "combat_state.match_id"
    ) !==
      identity(
        context.match_id,
        "context.match_id"
      )
  ) {
    throw buildError({
      message:
        "Shot execution processor Cing Artillery có combat/context identity mismatch",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_COMBAT_CONTEXT_MISMATCH_V1",
    });
  }

  if (
    identity(
      turnState.id,
      "turn_state.id"
    ) !==
      identity(
        context.turn_state_id,
        "context.turn_state_id"
      ) ||
    identity(
      turnState.combat_state_id,
      "turn_state.combat_state_id"
    ) !==
      identity(
        context.combat_state_id,
        "context.combat_state_id"
      ) ||
    integerNumber(
      turnState.turn_number,
      "turn_state.turn_number"
    ) !==
      integerNumber(
        context.turn_number,
        "context.turn_number"
      )
  ) {
    throw buildError({
      message:
        "Shot execution processor Cing Artillery có turn/context identity mismatch",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_TURN_CONTEXT_MISMATCH_V1",
    });
  }

  const activeAccountId =
    identity(
      turnState.active_account_id,
      "turn_state.active_account_id"
    );

  const contextActiveId =
    identity(
      context.active_account_id,
      "context.active_account_id"
    );

  const shooterAccountId =
    identity(
      context.shooter_account_id,
      "context.shooter_account_id"
    );

  if (
    activeAccountId !==
      contextActiveId ||
    activeAccountId !==
      shooterAccountId
  ) {
    throw buildError({
      message:
        "Shot execution processor Cing Artillery có active shooter mismatch",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_ACTIVE_SHOOTER_MISMATCH_V1",
    });
  }
}


function buildMutableParticipants({
  context,
  turnState,
}) {
  const shooterAccountId =
    identity(
      context.shooter_account_id,
      "context.shooter_account_id"
    );

  const opponentAccountId =
    identity(
      context.opponent_account_id,
      "context.opponent_account_id"
    );

  const playerOneAccountId =
    identity(
      turnState.player_one_account_id,
      "turn_state.player_one_account_id"
    );

  const playerTwoAccountId =
    identity(
      turnState.player_two_account_id,
      "turn_state.player_two_account_id"
    );

  let shooterSlot;
  let shooterSessionId;
  let opponentSlot;
  let opponentSessionId;

  if (
    shooterAccountId ===
      playerOneAccountId &&
    opponentAccountId ===
      playerTwoAccountId
  ) {
    shooterSlot = 1;
    shooterSessionId =
      turnState.player_one_session_id;

    opponentSlot = 2;
    opponentSessionId =
      turnState.player_two_session_id;
  } else if (
    shooterAccountId ===
      playerTwoAccountId &&
    opponentAccountId ===
      playerOneAccountId
  ) {
    shooterSlot = 2;
    shooterSessionId =
      turnState.player_two_session_id;

    opponentSlot = 1;
    opponentSessionId =
      turnState.player_one_session_id;
  } else {
    throw buildError({
      message:
        "Shot execution processor Cing Artillery không bind được mutable participant identity",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_PARTICIPANT_BINDING_INVALID_V1",
    });
  }

  return Object.freeze({
    shooter:
      Object.freeze({
        participant_slot:
          shooterSlot,
        account_id:
          shooterAccountId,
        gameplay_session_id:
          identity(
            shooterSessionId,
            "shooter_session_id"
          ),
        position_x:
          nonNegativeIntegerNumber(
            context.shooter_position_x,
            "shooter_position_x"
          ),
        position_y:
          nonNegativeIntegerNumber(
            context.shooter_position_y,
            "shooter_position_y"
          ),
        motion_state:
          "stable",
      }),

    opponent:
      Object.freeze({
        participant_slot:
          opponentSlot,
        account_id:
          opponentAccountId,
        gameplay_session_id:
          identity(
            opponentSessionId,
            "opponent_session_id"
          ),
        position_x:
          nonNegativeIntegerNumber(
            context.opponent_position_x,
            "opponent_position_x"
          ),
        position_y:
          nonNegativeIntegerNumber(
            context.opponent_position_y,
            "opponent_position_y"
          ),
        motion_state:
          "stable",
      }),
  });
}


function materializeDeterministicShotV1({
  context:
    rawContext,
  combatState,
  turnState,
}) {
  const context =
    assertObject(
      rawContext,
      "context"
    );

  const rules =
    assertObject(
      context.rules_snapshot,
      "rules_snapshot"
    );

  assertContextIdentity({
    context,
    combatState:
      assertObject(
        combatState,
        "combat_state"
      ),
    turnState:
      assertObject(
        turnState,
        "turn_state"
      ),
  });

  const physicsVersion =
    positiveIntegerNumber(
      rules.physics_version,
      "rules.physics_version"
    );

  const physicsFixedScale =
    positiveIntegerNumber(
      rules.physics_fixed_scale,
      "rules.physics_fixed_scale"
    );

  const mutableParticipants =
    buildMutableParticipants({
      context,
      turnState,
    });

  const playerHitRadiusScaled =
    toScaledBigInt(
      finiteNumber(
        rules.player_hit_radius_px,
        "rules.player_hit_radius_px"
      ),
      physicsFixedScale,
      "player_hit_radius_px"
    );

  const playerHitCenterOffsetYScaled =
    toScaledBigInt(
      finiteNumber(
        rules.player_hit_center_offset_y_px,
        "rules.player_hit_center_offset_y_px"
      ),
      physicsFixedScale,
      "player_hit_center_offset_y_px"
    );

  const projectileRadiusScaled =
    toScaledBigInt(
      finiteNumber(
        rules.projectile_radius_px,
        "rules.projectile_radius_px"
      ),
      physicsFixedScale,
      "projectile_radius_px"
    );

  const mutableBinding =
    deriveMutableOpponentBindingV1({
      shooter:
        mutableParticipants.shooter,
      opponent:
        mutableParticipants.opponent,
      physicsFixedScale,
      playerHitRadiusScaled,
      playerHitCenterOffsetYScaled,
    });

  const muzzle =
    deriveMuzzleOriginV1({
      shooterX:
        mutableBinding.shooter_position_x,
      shooterY:
        mutableBinding.shooter_position_y,
      opponentX:
        mutableBinding.opponent_position_x,
      muzzleOffsetForwardPx:
        finiteNumber(
          rules.muzzle_offset_forward_px,
          "rules.muzzle_offset_forward_px"
        ),
      muzzleOffsetUpPx:
        finiteNumber(
          rules.muzzle_offset_up_px,
          "rules.muzzle_offset_up_px"
        ),
      physicsFixedScale,
    });

  const launch =
    deriveLaunchVectorV1({
      angleDeg:
        finiteNumber(
          context.angle_deg,
          "angle_deg"
        ),
      angleMinDeg:
        finiteNumber(
          rules.angle_min_deg,
          "rules.angle_min_deg"
        ),
      angleMaxDeg:
        finiteNumber(
          rules.angle_max_deg,
          "rules.angle_max_deg"
        ),
      angleStepDeg:
        finiteNumber(
          rules.angle_step_deg,
          "rules.angle_step_deg"
        ),
      physicsFixedScale,
      trigAlgorithmVersion:
        positiveIntegerNumber(
          rules.trig_algorithm_version,
          "rules.trig_algorithm_version"
        ),
      trigAngleScale:
        positiveIntegerNumber(
          rules.trig_angle_scale,
          "rules.trig_angle_scale"
        ),
      trigValueScale:
        positiveIntegerNumber(
          rules.trig_value_scale,
          "rules.trig_value_scale"
        ),
      shooterX:
        mutableBinding.shooter_position_x,
      opponentX:
        mutableBinding.opponent_position_x,
    });

  const velocity =
    deriveInitialVelocityV1({
      power:
        finiteNumber(
          context.power,
          "power"
        ),
      powerMin:
        finiteNumber(
          rules.power_min,
          "rules.power_min"
        ),
      powerMax:
        finiteNumber(
          rules.power_max,
          "rules.power_max"
        ),
      powerVelocityScale:
        finiteNumber(
          rules.power_velocity_scale,
          "rules.power_velocity_scale"
        ),
      physicsFixedScale,
      directionXScaled:
        launch.direction_x_scaled,
      directionYScaled:
        launch.direction_y_scaled,
      directionValueScale:
        launch.direction_value_scale,
    });

  const accelerationRules =
    normalizeAccelerationRulesV1({
      gravity:
        finiteNumber(
          rules.gravity,
          "rules.gravity"
        ),
      windMin:
        finiteNumber(
          rules.wind_min,
          "rules.wind_min"
        ),
      windMax:
        finiteNumber(
          rules.wind_max,
          "rules.wind_max"
        ),
      physicsFixedScale,
    });

  const initialWindScaled =
    exactBigInt(
      context.initial_wind_scaled,
      "initial_wind_scaled"
    );

  if (
    initialWindScaled <
      accelerationRules.wind_min_scaled ||
    initialWindScaled >
      accelerationRules.wind_max_scaled
  ) {
    throw buildError({
      message:
        "Shot execution processor Cing Artillery có persisted wind ngoài rules snapshot",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_WIND_OUT_OF_RANGE_V1",
    });
  }

  const acceleration =
    mapWorldAccelerationV1({
      physicsVersion,
      gravityScaled:
        accelerationRules.gravity_scaled,
      initialWindScaled,
    });

  const trajectory =
    solveShotTrajectoryV1({
      physicsVersion,
      physicsStepMs:
        positiveIntegerNumber(
          rules.physics_step_ms,
          "rules.physics_step_ms"
        ),
      maxFlightTimeMs:
        positiveIntegerNumber(
          rules.max_flight_time_ms,
          "rules.max_flight_time_ms"
        ),
      physicsFixedScale,
      originXScaled:
        muzzle.origin_x_scaled,
      originYScaled:
        muzzle.origin_y_scaled,
      initialVxScaled:
        velocity.vx_scaled,
      initialVyScaled:
        velocity.vy_scaled,
      axScaled:
        acceleration.ax_scaled,
      ayScaled:
        acceleration.ay_scaled,
      projectileRadiusScaled,
      playerCollider:
        mutableBinding.opponent_collider,
      widthPx:
        positiveIntegerNumber(
          context.terrain_width_px,
          "terrain_width_px"
        ),
      heightPx:
        positiveIntegerNumber(
          context.terrain_height_px,
          "terrain_height_px"
        ),
      collisionMask:
        collisionMaskFromHex(
          context.collision_mask_hex
        ),
    });

  const blastRadius =
    normalizeBlastRadiusNumericV1({
      blastRadius:
        finiteNumber(
          rules.blast_radius,
          "rules.blast_radius"
        ),
      physicsFixedScale,
    });

  let blastEligibility =
    null;

  let exactBlastDistance =
    null;

  if (
    trajectory.outcome ===
      SHOT_TRAJECTORY_SOLVER_OUTCOME_V1
        .TERRAIN_HIT
  ) {
    blastEligibility =
      classifyBlastTargetEligibilityV1({
        shotTrajectoryResult:
          trajectory,
        opponentCollider:
          mutableBinding.opponent_collider,
        blastRadiusScaled:
          blastRadius.blast_radius_scaled,
      });

    if (
      blastEligibility.opponent_affected
    ) {
      exactBlastDistance =
        calculateExactBlastDistanceFloorV1({
          exactImpact:
            trajectory.exact_impact,
          targetCenterXScaled:
            mutableBinding
              .opponent_collider
              .center_x_scaled,
          targetCenterYScaled:
            mutableBinding
              .opponent_collider
              .center_y_scaled,
          blastRadiusScaled:
            blastRadius
              .blast_radius_scaled,
        });
    }
  }

  const canonicalTarget =
    materializeCanonicalShotTargetV1({
      shotTrajectoryResult:
        trajectory,
      opponentBinding:
        mutableBinding,
      blastTargetEligibility:
        blastEligibility,
    });

  const statBinding =
    deriveCombatDamageStatBindingV1({
      turnState,
      combatState,
      opponentBinding:
        mutableBinding,
    });

  const canonicalDamage =
    materializeCanonicalShotDamageV1({
      shotTrajectoryResult:
        trajectory,
      canonicalTarget:
        canonicalTarget.target_account_id,
      opponentBinding:
        mutableBinding,
      blastTargetEligibility:
        blastEligibility,
      exactBlastDistanceFloor:
        exactBlastDistance
          ? exactBlastDistance
              .distance_floor_scaled
          : null,
      damageRules:
        rules,
      statBinding,
      blastRadiusNumeric:
        blastRadius
          .blast_radius_scaled,
    });

  const collisionOutcome =
    trajectory.outcome ===
      SHOT_TRAJECTORY_SOLVER_OUTCOME_V1
        .PLAYER_HIT ||
    trajectory.outcome ===
      SHOT_TRAJECTORY_SOLVER_OUTCOME_V1
        .TERRAIN_HIT;

  const projection =
    projectResolutionPersistenceV1({
      canonicalShotDamage:
        canonicalDamage,
      physicsVersion,
      ...(collisionOutcome
        ? {
            physicsFixedScale,
          }
        : {}),
    });

  const trajectoryPresentation =
    projectTrajectoryPresentationPersistenceV1(
      trajectory
        .trajectory_presentation
    );


  return Object.freeze({
    mutable_binding:
      mutableBinding,
    trajectory,

    trajectory_presentation:
      trajectoryPresentation,
    projection,
  });
}


async function processClaimedShotExecutionV1({
  executionId:
    rawExecutionId,
  claimToken:
    rawClaimToken,
}) {
  const executionId =
    identity(
      rawExecutionId,
      "execution_id"
    );

  const claimToken =
    identity(
      rawClaimToken,
      "claim_token"
    );

  const context =
    await executionRepository
      .materializeContextAtomic({
        executionId,
        claimToken,
      });

  if (!context) {
    throw buildError({
      message:
        "Shot execution processor Cing Artillery không materialize được execution context",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_CONTEXT_MISSING_V1",
    });
  }

  if (
    identity(
      context.execution_id,
      "context.execution_id"
    ) !== executionId ||
    identity(
      context.claim_token,
      "context.claim_token"
    ) !== claimToken
  ) {
    throw buildError({
      message:
        "Shot execution processor Cing Artillery nhận context ngoài live claim",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_CONTEXT_CLAIM_MISMATCH_V1",
    });
  }

  const [
    combatState,
    turnState,
  ] =
    await Promise.all([
      combatStateService
        .getByMatchRuntimeId(
          context.match_runtime_id
        ),

      turnStateService
        .getByCombatStateId(
          context.combat_state_id
        ),
    ]);

  if (
    !combatState ||
    !turnState
  ) {
    throw buildError({
      message:
        "Shot execution processor Cing Artillery thiếu combat/turn authority",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_AUTHORITY_MISSING_V1",
    });
  }

  const computation =
    materializeDeterministicShotV1({
      context,
      combatState,
      turnState,
    });

  const settlement =
    await executionRepository
      .commitResolutionWithTrajectoryFencedAtomic({
        executionId,

        claimToken,

        projection:
          computation.projection,

        trajectoryPresentation:
          computation
            .trajectory_presentation,
      });


  if (!settlement) {
    throw buildError({
      message:
        "Shot execution processor Cing Artillery không nhận được durable settlement",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_SETTLEMENT_MISSING_V1",
    });
  }

  return Object.freeze({
    settlement,
    trajectory:
      computation.trajectory,

    trajectory_presentation:
      computation
        .trajectory_presentation,
    projection:
      computation.projection,
  });
}


module.exports = {
  materializeDeterministicShotV1,
  processClaimedShotExecutionV1,
};
