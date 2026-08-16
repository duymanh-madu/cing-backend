const repository =
  require(
    "../repositories/cingArtilleryTurnStateRepository"
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
  normalizeTurnStateRecord,
} = require(
  "../domain/cingArtilleryTurnStateContracts"
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

  if (
    message.includes(
      "cing_artillery_disabled"
    ) ||
    message.includes(
      "CING_ARTILLERY_DISABLED"
    )
  ) {
    return buildError({
      message:
        "Cing Artillery hiện chưa được mở",
      code:
        "CING_ARTILLERY_DISABLED",
      statusCode:
        503,
      cause:
        error,
    });
  }

  if (
    message.includes(
      "cing_artillery_config_invalid"
    )
  ) {
    return buildError({
      message:
        "Cấu hình Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_CONFIG_INVALID",
      statusCode:
        503,
      cause:
        error,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_COMBAT_STATE_NOT_FOUND"
    )
  ) {
    return buildError({
      message:
        "Không tìm thấy combat state Cing Artillery",
      code:
        "CING_ARTILLERY_COMBAT_STATE_NOT_FOUND",
      statusCode:
        404,
      cause:
        error,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_COMBAT_STATE_NOT_TURN_ELIGIBLE"
    )
  ) {
    return buildError({
      message:
        "Combat state Cing Artillery chưa đủ điều kiện khởi tạo turn state",
      code:
        "CING_ARTILLERY_COMBAT_STATE_NOT_TURN_ELIGIBLE",
      statusCode:
        409,
      cause:
        error,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_TURN_STATE_INCONSISTENT"
    )
  ) {
    return buildError({
      message:
        "Turn state Cing Artillery không nhất quán với combat authority",
      code:
        "CING_ARTILLERY_TURN_STATE_INCONSISTENT",
      statusCode:
        409,
      cause:
        error,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_TURN_STATE_RESOLUTION_FAILED"
    )
  ) {
    return buildError({
      message:
        "Không thể xác lập turn state Cing Artillery",
      code:
        "CING_ARTILLERY_TURN_STATE_RESOLUTION_FAILED",
      statusCode:
        500,
      cause:
        error,
    });
  }

  return error;
}

async function getByCombatStateId(
  rawCombatStateId
) {
  const combatStateId =
    assertCombatStateId(
      rawCombatStateId
    );

  const row =
    await repository
      .findByCombatStateId(
        combatStateId
      );

  return normalizeTurnStateRecord(
    row
  );
}

async function getOrCreateForCombatState(
  rawCombatStateId
) {
  await requireCingArtilleryEnabled();

  const combatStateId =
    assertCombatStateId(
      rawCombatStateId
    );

  try {
    const row =
      await repository
        .getOrCreateAtomic(
          combatStateId
        );

    if (!row) {
      throw buildError({
        message:
          "Không thể xác lập turn state Cing Artillery",
        code:
          "CING_ARTILLERY_TURN_STATE_RESOLUTION_FAILED",
        statusCode:
          500,
      });
    }

    return normalizeTurnStateRecord(
      row
    );
  } catch (error) {
    throw mapRepositoryError(
      error
    );
  }
}

module.exports = {
  getByCombatStateId,
  getOrCreateForCombatState,
};
