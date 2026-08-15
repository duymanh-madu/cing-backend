const repository =
  require(
    "../repositories/cingArtilleryCombatStateRepository"
  );

const {
  assertMatchRuntimeId,
  normalizeCombatStateRecord,
} = require(
  "../domain/cingArtilleryCombatStateContracts"
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
      "CING_ARTILLERY_MATCH_RUNTIME_NOT_FOUND"
    )
  ) {
    return buildError({
      message:
        "Không tìm thấy match runtime Cing Artillery",
      code:
        "CING_ARTILLERY_MATCH_RUNTIME_NOT_FOUND",
      statusCode:
        404,
      cause:
        error,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_MATCH_RUNTIME_NOT_COMBAT_ELIGIBLE"
    )
  ) {
    return buildError({
      message:
        "Match runtime Cing Artillery chưa đủ điều kiện khởi tạo combat",
      code:
        "CING_ARTILLERY_MATCH_RUNTIME_NOT_COMBAT_ELIGIBLE",
      statusCode:
        409,
      cause:
        error,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_COMBAT_STATE_INCONSISTENT"
    )
  ) {
    return buildError({
      message:
        "Combat state Cing Artillery không nhất quán với match runtime",
      code:
        "CING_ARTILLERY_COMBAT_STATE_INCONSISTENT",
      statusCode:
        409,
      cause:
        error,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_COMBAT_STATE_RESOLUTION_FAILED"
    )
  ) {
    return buildError({
      message:
        "Không thể xác lập combat state Cing Artillery",
      code:
        "CING_ARTILLERY_COMBAT_STATE_RESOLUTION_FAILED",
      statusCode:
        500,
      cause:
        error,
    });
  }

  if (
    message.includes(
      "cing_artillery_disabled"
    )
  ) {
    return buildError({
      message:
        "Cing Artillery hiện đang tắt",
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
        500,
      cause:
        error,
    });
  }

  return error;
}

async function getByMatchRuntimeId(
  rawMatchRuntimeId
) {
  const matchRuntimeId =
    assertMatchRuntimeId(
      rawMatchRuntimeId
    );

  const row =
    await repository
      .findByMatchRuntimeId(
        matchRuntimeId
      );

  return normalizeCombatStateRecord(
    row
  );
}

async function getOrCreateForMatchRuntime(
  rawMatchRuntimeId
) {
  const matchRuntimeId =
    assertMatchRuntimeId(
      rawMatchRuntimeId
    );

  try {
    const row =
      await repository
        .getOrCreateAtomic(
          matchRuntimeId
        );

    if (!row) {
      throw buildError({
        message:
          "Không thể xác lập combat state Cing Artillery",
        code:
          "CING_ARTILLERY_COMBAT_STATE_RESOLUTION_FAILED",
        statusCode:
          500,
      });
    }

    return normalizeCombatStateRecord(
      row
    );
  } catch (error) {
    throw mapRepositoryError(
      error
    );
  }
}

module.exports = {
  getByMatchRuntimeId,
  getOrCreateForMatchRuntime,
};
