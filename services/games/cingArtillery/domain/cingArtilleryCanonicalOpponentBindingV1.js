"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * CANONICAL OPPONENT BINDING V1
 *
 * Purpose:
 *
 *   bind canonical participant identity
 *   to canonical combat-world player slot
 *   and derive the canonical opponent collider.
 *
 * Identity authority:
 *
 *   TurnState participant pair:
 *
 *     player_one_account_id / session_id
 *     player_two_account_id / session_id
 *
 * Shooter authority:
 *
 *   active_account_id / active_session_id
 *
 * World geometry authority:
 *
 *   player_one_x / player_one_y
 *   player_two_x / player_two_y
 *
 * Player slot is the bridge between identity and geometry.
 *
 * Combat-world side labels A/B are NOT identity authority.
 *
 * This module does NOT:
 *
 *   classify projectile collision
 *   choose terrain blast target
 *   calculate blast distance
 *   calculate damage
 *   decide self damage
 *   mutate HP
 *   write PostgreSQL
 *   advance turn
 *   emit realtime events
 *
 * PostgreSQL fenced resolution commit must later revalidate
 * canonical participant target authority before persistence.
 */

const {
  CING_ARTILLERY_TURN_STATE_STATUS,
  normalizeTurnStateRecord,
} =
  require(
    "./cingArtilleryTurnStateContracts"
  );

const {
  normalizeCombatWorldRecord,
} =
  require(
    "./cingArtilleryCombatWorldContracts"
  );

const {
  derivePlayerColliderV1,
} =
  require(
    "./cingArtilleryPlayerColliderV1"
  );


const CANONICAL_PLAYER_SLOT_V1 =
  Object.freeze({
    PLAYER_ONE:
      "player_one",

    PLAYER_TWO:
      "player_two",
  });


function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_CANONICAL_OPPONENT_BINDING_V1",
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}


function assertPositiveSafeInteger(
  value,
  field
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
        `Canonical opponent binding Cing Artillery không hợp lệ: ${field}`,
    });
  }


  return value;
}


function assertPositiveBigInt(
  value,
  field
) {
  if (
    typeof value !==
      "bigint" ||
    value <=
      0n
  ) {
    throw buildError({
      message:
        `Canonical opponent binding Cing Artillery không hợp lệ: ${field}`,
    });
  }


  return value;
}


function deriveCanonicalOpponentBindingV1({
  turnState,
  combatWorld,

  shooterAccountId,
  shooterSessionId,

  physicsFixedScale,
  playerHitRadiusScaled,
  playerHitCenterOffsetYScaled,
} = {}) {
  const turn =
    normalizeTurnStateRecord(
      turnState
    );


  if (
    !turn ||
    turn.status !==
      CING_ARTILLERY_TURN_STATE_STATUS.ACTIVE
  ) {
    throw buildError({
      message:
        "Canonical opponent binding Cing Artillery yêu cầu active turn state",
    });
  }


  const world =
    normalizeCombatWorldRecord(
      combatWorld
    );


  if (!world) {
    throw buildError({
      message:
        "Canonical opponent binding Cing Artillery thiếu combat world",
    });
  }


  if (
    world.combat_state_id !==
      turn.combat_state_id ||
    world.match_runtime_id !==
      turn.match_runtime_id ||
    world.match_id !==
      turn.match_id
  ) {
    throw buildError({
      message:
        "Canonical opponent binding Cing Artillery có combat/world identity mismatch",
      code:
        "CING_ARTILLERY_CANONICAL_OPPONENT_WORLD_IDENTITY_MISMATCH_V1",
    });
  }


  if (
    shooterAccountId !==
      turn.active_account_id ||
    shooterSessionId !==
      turn.active_session_id
  ) {
    throw buildError({
      message:
        "Canonical opponent binding Cing Artillery có shooter không phải active participant",
      code:
        "CING_ARTILLERY_CANONICAL_OPPONENT_SHOOTER_MISMATCH_V1",
    });
  }


  const shooterIsPlayerOne =
    shooterAccountId ===
      turn.player_one_account_id &&
    shooterSessionId ===
      turn.player_one_session_id;

  const shooterIsPlayerTwo =
    shooterAccountId ===
      turn.player_two_account_id &&
    shooterSessionId ===
      turn.player_two_session_id;


  if (
    shooterIsPlayerOne ===
      shooterIsPlayerTwo
  ) {
    throw buildError({
      message:
        "Canonical opponent binding Cing Artillery không xác định được shooter slot",
      code:
        "CING_ARTILLERY_CANONICAL_OPPONENT_SLOT_INVALID_V1",
    });
  }


  const scale =
    assertPositiveSafeInteger(
      physicsFixedScale,
      "physics_fixed_scale"
    );

  const radius =
    assertPositiveBigInt(
      playerHitRadiusScaled,
      "player_hit_radius_scaled"
    );

  const centerOffset =
    assertPositiveBigInt(
      playerHitCenterOffsetYScaled,
      "player_hit_center_offset_y_scaled"
    );


  const shooterSlot =
    shooterIsPlayerOne
      ? CANONICAL_PLAYER_SLOT_V1.PLAYER_ONE
      : CANONICAL_PLAYER_SLOT_V1.PLAYER_TWO;

  const opponentSlot =
    shooterIsPlayerOne
      ? CANONICAL_PLAYER_SLOT_V1.PLAYER_TWO
      : CANONICAL_PLAYER_SLOT_V1.PLAYER_ONE;


  const opponentAccountId =
    shooterIsPlayerOne
      ? turn.player_two_account_id
      : turn.player_one_account_id;

  const opponentSessionId =
    shooterIsPlayerOne
      ? turn.player_two_session_id
      : turn.player_one_session_id;


  const opponentSpawnX =
    shooterIsPlayerOne
      ? world.player_two_x
      : world.player_one_x;

  const opponentSpawnY =
    shooterIsPlayerOne
      ? world.player_two_y
      : world.player_one_y;


  const opponentCollider =
    derivePlayerColliderV1({
      spawnX:
        opponentSpawnX,

      spawnY:
        opponentSpawnY,

      physicsFixedScale:
        scale,

      playerHitRadiusScaled:
        radius,

      playerHitCenterOffsetYScaled:
        centerOffset,
    });


  return Object.freeze({
    shooter_slot:
      shooterSlot,

    shooter_account_id:
      shooterAccountId,

    shooter_session_id:
      shooterSessionId,

    opponent_slot:
      opponentSlot,

    opponent_account_id:
      opponentAccountId,

    opponent_session_id:
      opponentSessionId,

    opponent_spawn_x:
      opponentSpawnX,

    opponent_spawn_y:
      opponentSpawnY,

    opponent_collider:
      opponentCollider,
  });
}


module.exports = {
  CANONICAL_PLAYER_SLOT_V1,
  deriveCanonicalOpponentBindingV1,
};
