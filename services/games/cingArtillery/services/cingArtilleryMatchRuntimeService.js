const matchRuntimeRepository =
  require(
    "../repositories/cingArtilleryMatchRuntimeRepository"
  );

const {
  requireCingArtilleryEnabled,
} = require(
  "./cingArtilleryFeatureGateService"
);

const {
  assertMatchId,
  normalizeMatchRuntimeRecord,
} = require(
  "../domain/cingArtilleryMatchRuntimeContracts"
);

function buildError({
  message,
  code,
  statusCode,
}) {
  const error =
    new Error(
      message
    );

  error.code =
    code;

  error.statusCode =
    statusCode;

  return error;
}

function mapMatchRuntimeError(
  error
) {
  const message =
    String(
      error?.message || ""
    );

  if (
    message.includes(
      "cing_artillery_disabled"
    )
  ) {
    return buildError({
      message:
        "Cing Artillery hiện chưa được mở",

      code:
        "CING_ARTILLERY_DISABLED",

      statusCode:
        503,
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
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_MATCH_NOT_FOUND"
    )
  ) {
    return buildError({
      message:
        "Không tìm thấy match Cing Artillery",

      code:
        "CING_ARTILLERY_MATCH_NOT_FOUND",

      statusCode:
        404,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_MATCH_NOT_RUNTIME_ELIGIBLE"
    )
  ) {
    return buildError({
      message:
        "Match Cing Artillery không đủ điều kiện khởi tạo runtime",

      code:
        "CING_ARTILLERY_MATCH_NOT_RUNTIME_ELIGIBLE",

      statusCode:
        409,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_MATCH_PLAYER_ONE_SESSION_NOT_ACTIVE"
    ) ||
    message.includes(
      "CING_ARTILLERY_MATCH_PLAYER_TWO_SESSION_NOT_ACTIVE"
    )
  ) {
    return buildError({
      message:
        "Gameplay session của match Cing Artillery không còn active",

      code:
        "CING_ARTILLERY_MATCH_GAMEPLAY_SESSION_NOT_ACTIVE",

      statusCode:
        409,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_MATCH_RUNTIME_RESOLUTION_FAILED"
    ) ||
    message.includes(
      "CING_ARTILLERY_MATCH_RUNTIME_STATE_INCONSISTENT"
    )
  ) {
    return buildError({
      message:
        "Trạng thái match runtime Cing Artillery không nhất quán",

      code:
        "CING_ARTILLERY_MATCH_RUNTIME_STATE_INCONSISTENT",

      statusCode:
        500,
    });
  }

  return error;
}

async function getMatchRuntime(
  rawMatchId
) {
  const matchId =
    assertMatchId(
      rawMatchId
    );

  const runtime =
    await matchRuntimeRepository
      .findByMatchId(
        matchId
      );

  return normalizeMatchRuntimeRecord(
    runtime
  );
}

async function getOrCreateMatchRuntime(
  rawMatchId
) {
  /*
   * Private durable match-runtime write boundary.
   *
   * PostgreSQL owns:
   *   canonical match ownership
   *   gameplay-session eligibility
   *   one-runtime-per-match concurrency
   *
   * This service intentionally does not own realtime,
   * combat, scoring, economy, or public transport.
   */
  await requireCingArtilleryEnabled();

  const matchId =
    assertMatchId(
      rawMatchId
    );

  try {
    const runtime =
      await matchRuntimeRepository
        .getOrCreateAtomic({
          matchId,
        });

    return normalizeMatchRuntimeRecord(
      runtime
    );
  } catch (error) {
    throw mapMatchRuntimeError(
      error
    );
  }
}

module.exports = {
  getMatchRuntime,
  getOrCreateMatchRuntime,
};
