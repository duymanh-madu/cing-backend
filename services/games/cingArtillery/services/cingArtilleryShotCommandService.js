const repository =
  require(
    "../repositories/cingArtilleryShotCommandRepository"
  );

const {
  requireCingArtilleryEnabled,
} = require(
  "./cingArtilleryFeatureGateService"
);

const {
  assertCombatStateId,
} = require(
  "../domain/cingArtilleryCombatStateContracts"
);

const {
  assertShotCommandId,
  assertShooterAccountId,
  assertShooterSessionId,
  assertShotTurnNumber,
  assertShotAngleDeg,
  assertShotPower,
  normalizeShotCommandRecord,
} = require(
  "../domain/cingArtilleryShotCommandContracts"
);

function buildError({
  message,
  code,
  statusCode,
  cause,
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    statusCode;

  if (cause) {
    error.cause =
      cause;
  }

  return error;
}

function mapRepositoryError(
  error
) {
  const message =
    String(
      error?.message || ""
    );

  const mappings = [
    {
      tokens: [
        "cing_artillery_disabled",
        "CING_ARTILLERY_DISABLED",
      ],
      message:
        "Cing Artillery hiện chưa được mở",
      code:
        "CING_ARTILLERY_DISABLED",
      statusCode:
        503,
    },
    {
      tokens: [
        "cing_artillery_config_invalid",
      ],
      message:
        "Cấu hình Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_CONFIG_INVALID",
      statusCode:
        503,
    },
    {
      tokens: [
        "CING_ARTILLERY_COMBAT_STATE_NOT_FOUND",
      ],
      message:
        "Không tìm thấy combat state Cing Artillery",
      code:
        "CING_ARTILLERY_COMBAT_STATE_NOT_FOUND",
      statusCode:
        404,
    },
    {
      tokens: [
        "CING_ARTILLERY_COMBAT_STATE_NOT_SHOT_ELIGIBLE",
      ],
      message:
        "Combat state Cing Artillery chưa đủ điều kiện nhận shot command",
      code:
        "CING_ARTILLERY_COMBAT_STATE_NOT_SHOT_ELIGIBLE",
      statusCode:
        409,
    },
    {
      tokens: [
        "CING_ARTILLERY_TURN_STATE_NOT_FOUND",
      ],
      message:
        "Không tìm thấy turn state Cing Artillery",
      code:
        "CING_ARTILLERY_TURN_STATE_NOT_FOUND",
      statusCode:
        404,
    },
    {
      tokens: [
        "CING_ARTILLERY_SHOT_STATE_INCONSISTENT",
      ],
      message:
        "Shot authority Cing Artillery không nhất quán với combat state",
      code:
        "CING_ARTILLERY_SHOT_STATE_INCONSISTENT",
      statusCode:
        409,
    },
    {
      tokens: [
        "CING_ARTILLERY_SHOT_COMMAND_IDEMPOTENCY_CONFLICT",
      ],
      message:
        "Shot command Cing Artillery xung đột idempotency",
      code:
        "CING_ARTILLERY_SHOT_COMMAND_IDEMPOTENCY_CONFLICT",
      statusCode:
        409,
    },
    {
      tokens: [
        "CING_ARTILLERY_TURN_NOT_ACTIVE",
      ],
      message:
        "Lượt Cing Artillery hiện không active",
      code:
        "CING_ARTILLERY_TURN_NOT_ACTIVE",
      statusCode:
        409,
    },
    {
      tokens: [
        "CING_ARTILLERY_SHOT_TURN_MISMATCH",
      ],
      message:
        "Shot command không thuộc lượt Cing Artillery hiện tại",
      code:
        "CING_ARTILLERY_SHOT_TURN_MISMATCH",
      statusCode:
        409,
    },
    {
      tokens: [
        "CING_ARTILLERY_SHOT_NOT_ACTIVE_PARTICIPANT",
      ],
      message:
        "Người gửi shot command không phải participant đang có lượt",
      code:
        "CING_ARTILLERY_SHOT_NOT_ACTIVE_PARTICIPANT",
      statusCode:
        403,
    },
    {
      tokens: [
        "CING_ARTILLERY_SHOT_RULES_INVALID",
      ],
      message:
        "Luật shot Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_SHOT_RULES_INVALID",
      statusCode:
        500,
    },
    {
      tokens: [
        "CING_ARTILLERY_SHOT_ANGLE_OUT_OF_RANGE",
      ],
      message:
        "Góc bắn Cing Artillery ngoài phạm vi cho phép",
      code:
        "CING_ARTILLERY_SHOT_ANGLE_OUT_OF_RANGE",
      statusCode:
        400,
    },
    {
      tokens: [
        "CING_ARTILLERY_SHOT_POWER_OUT_OF_RANGE",
      ],
      message:
        "Lực bắn Cing Artillery ngoài phạm vi cho phép",
      code:
        "CING_ARTILLERY_SHOT_POWER_OUT_OF_RANGE",
      statusCode:
        400,
    },
    {
      tokens: [
        "CING_ARTILLERY_SHOT_TURN_EXPIRED",
      ],
      message:
        "Lượt bắn Cing Artillery đã hết thời gian",
      code:
        "CING_ARTILLERY_SHOT_TURN_EXPIRED",
      statusCode:
        409,
    },
    {
      tokens: [
        "CING_ARTILLERY_SHOT_ALREADY_ACCEPTED_FOR_TURN",
      ],
      message:
        "Lượt Cing Artillery đã có shot command được chấp nhận",
      code:
        "CING_ARTILLERY_SHOT_ALREADY_ACCEPTED_FOR_TURN",
      statusCode:
        409,
    },
    {
      tokens: [
        "CING_ARTILLERY_SHOT_COMMAND_PERSISTENCE_INCONSISTENT",
      ],
      message:
        "Không thể xác lập shot command Cing Artillery nhất quán",
      code:
        "CING_ARTILLERY_SHOT_COMMAND_PERSISTENCE_INCONSISTENT",
      statusCode:
        500,
    },
  ];

  const mapping =
    mappings.find(
      (candidate) =>
        candidate.tokens.some(
          (token) =>
            message.includes(
              token
            )
        )
    );

  if (!mapping) {
    return error;
  }

  return buildError({
    message:
      mapping.message,
    code:
      mapping.code,
    statusCode:
      mapping.statusCode,
    cause:
      error,
  });
}

async function acceptShotCommand({
  combatStateId:
    rawCombatStateId,
  shooterAccountId:
    rawShooterAccountId,
  shooterSessionId:
    rawShooterSessionId,
  turnNumber:
    rawTurnNumber,
  commandId:
    rawCommandId,
  angleDeg:
    rawAngleDeg,
  power:
    rawPower,
}) {
  await requireCingArtilleryEnabled();

  const combatStateId =
    assertCombatStateId(
      rawCombatStateId
    );

  const shooterAccountId =
    assertShooterAccountId(
      rawShooterAccountId
    );

  const shooterSessionId =
    assertShooterSessionId(
      rawShooterSessionId
    );

  const turnNumber =
    assertShotTurnNumber(
      rawTurnNumber
    );

  const commandId =
    assertShotCommandId(
      rawCommandId
    );

  const angleDeg =
    assertShotAngleDeg(
      rawAngleDeg
    );

  const power =
    assertShotPower(
      rawPower
    );

  try {
    const row =
      await repository
        .acceptAtomic({
          combatStateId,
          shooterAccountId,
          shooterSessionId,
          turnNumber,
          commandId,
          angleDeg,
          power,
        });

    if (!row) {
      throw buildError({
        message:
          "Không thể xác lập shot command Cing Artillery",
        code:
          "CING_ARTILLERY_SHOT_COMMAND_RESOLUTION_FAILED",
        statusCode:
          500,
      });
    }

    return normalizeShotCommandRecord(
      row
    );
  } catch (error) {
    throw mapRepositoryError(
      error
    );
  }
}

module.exports = {
  acceptShotCommand,
};
