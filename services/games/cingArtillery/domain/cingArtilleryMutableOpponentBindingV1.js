"use strict";

/*
 * CING PIU PIU / CING ARTILLERY
 * MUTABLE OPPONENT BINDING V1
 *
 * Binds canonical participant identity to CURRENT mutable
 * player-world geometry for shot execution.
 *
 * Immutable combat-world spawn coordinates are provenance
 * only and are intentionally not accepted here.
 */

const {
  derivePlayerColliderV1,
} = require(
  "./cingArtilleryPlayerColliderV1"
);

const PLAYER_ONE =
  "player_one";

const PLAYER_TWO =
  "player_two";

function buildError({
  message,
  code =
    "CING_ARTILLERY_INVALID_MUTABLE_OPPONENT_BINDING_V1",
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
        `Mutable opponent binding Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}

function assertIdentity(
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
        `Mutable opponent binding Cing Artillery thiếu ${field}`,
    });
  }

  return normalized;
}

function assertCoordinate(
  value,
  field
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw buildError({
      message:
        `Mutable opponent binding Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}

function assertPositiveSafeInteger(
  value,
  field
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw buildError({
      message:
        `Mutable opponent binding Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}

function assertPositiveBigInt(
  value,
  field
) {
  if (
    typeof value !== "bigint" ||
    value <= 0n
  ) {
    throw buildError({
      message:
        `Mutable opponent binding Cing Artillery không hợp lệ: ${field}`,
    });
  }

  return value;
}

function deriveMutableOpponentBindingV1({
  shooter,
  opponent,
  physicsFixedScale,
  playerHitRadiusScaled,
  playerHitCenterOffsetYScaled,
} = {}) {
  const shooterState =
    assertObject(
      shooter,
      "shooter"
    );

  const opponentState =
    assertObject(
      opponent,
      "opponent"
    );

  const shooterSlot =
    shooterState.participant_slot;

  const opponentSlot =
    opponentState.participant_slot;

  if (
    !(
      (
        shooterSlot === 1 &&
        opponentSlot === 2
      ) ||
      (
        shooterSlot === 2 &&
        opponentSlot === 1
      )
    )
  ) {
    throw buildError({
      message:
        "Mutable opponent binding Cing Artillery có participant slots không hợp lệ",
      code:
        "CING_ARTILLERY_MUTABLE_OPPONENT_SLOT_MISMATCH_V1",
    });
  }

  if (
    shooterState.motion_state !== "stable" ||
    opponentState.motion_state !== "stable"
  ) {
    throw buildError({
      message:
        "Mutable opponent binding Cing Artillery yêu cầu cả hai player stable",
      code:
        "CING_ARTILLERY_MUTABLE_OPPONENT_MOTION_STATE_INVALID_V1",
    });
  }

  const shooterAccountId =
    assertIdentity(
      shooterState.account_id,
      "shooter.account_id"
    );

  const shooterSessionId =
    assertIdentity(
      shooterState.gameplay_session_id,
      "shooter.gameplay_session_id"
    );

  const opponentAccountId =
    assertIdentity(
      opponentState.account_id,
      "opponent.account_id"
    );

  const opponentSessionId =
    assertIdentity(
      opponentState.gameplay_session_id,
      "opponent.gameplay_session_id"
    );

  if (
    shooterAccountId === opponentAccountId ||
    shooterSessionId === opponentSessionId
  ) {
    throw buildError({
      message:
        "Mutable opponent binding Cing Artillery có participant identity trùng nhau",
      code:
        "CING_ARTILLERY_MUTABLE_OPPONENT_IDENTITY_INVALID_V1",
    });
  }

  const shooterX =
    assertCoordinate(
      shooterState.position_x,
      "shooter.position_x"
    );

  const shooterY =
    assertCoordinate(
      shooterState.position_y,
      "shooter.position_y"
    );

  const opponentX =
    assertCoordinate(
      opponentState.position_x,
      "opponent.position_x"
    );

  const opponentY =
    assertCoordinate(
      opponentState.position_y,
      "opponent.position_y"
    );

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

  const opponentCollider =
    derivePlayerColliderV1({
      spawnX:
        opponentX,
      spawnY:
        opponentY,
      physicsFixedScale:
        scale,
      playerHitRadiusScaled:
        radius,
      playerHitCenterOffsetYScaled:
        centerOffset,
    });

  return Object.freeze({
    shooter_slot:
      shooterSlot === 1
        ? PLAYER_ONE
        : PLAYER_TWO,
    shooter_account_id:
      shooterAccountId,
    shooter_session_id:
      shooterSessionId,
    shooter_position_x:
      shooterX,
    shooter_position_y:
      shooterY,

    opponent_slot:
      opponentSlot === 1
        ? PLAYER_ONE
        : PLAYER_TWO,
    opponent_account_id:
      opponentAccountId,
    opponent_session_id:
      opponentSessionId,
    opponent_position_x:
      opponentX,
    opponent_position_y:
      opponentY,
    opponent_collider:
      opponentCollider,
  });
}

module.exports = {
  deriveMutableOpponentBindingV1,
};
