const CING_ARTILLERY_MATCH_RUNTIME_STATUS =
  Object.freeze({
    READY:
      "ready",
  });

const VALID_MATCH_RUNTIME_STATUSES =
  new Set(
    Object.values(
      CING_ARTILLERY_MATCH_RUNTIME_STATUS
    )
  );

function assertMatchId(
  value
) {
  const matchId =
    String(
      value || ""
    ).trim();

  if (!matchId) {
    const error =
      new Error(
        "Thiếu match id Cing Artillery"
      );

    error.code =
      "CING_ARTILLERY_MATCH_ID_REQUIRED";

    error.statusCode =
      400;

    throw error;
  }

  return matchId;
}

function assertMatchRuntimeStatus(
  value
) {
  const status =
    String(
      value || ""
    ).trim();

  if (
    !VALID_MATCH_RUNTIME_STATUSES.has(
      status
    )
  ) {
    const error =
      new Error(
        `Trạng thái match runtime Cing Artillery không hợp lệ: ${status}`
      );

    error.code =
      "CING_ARTILLERY_INVALID_MATCH_RUNTIME_STATUS";

    error.statusCode =
      500;

    throw error;
  }

  return status;
}

function normalizeMatchRuntimeRecord(
  row
) {
  if (!row) {
    return null;
  }

  const id =
    String(
      row.id || ""
    ).trim();

  const matchId =
    String(
      row.match_id || ""
    ).trim();

  const playerOneAccountId =
    String(
      row.player_one_account_id || ""
    ).trim();

  const playerOneSessionId =
    String(
      row.player_one_session_id || ""
    ).trim();

  const playerTwoAccountId =
    String(
      row.player_two_account_id || ""
    ).trim();

  const playerTwoSessionId =
    String(
      row.player_two_session_id || ""
    ).trim();

  if (
    !id ||
    !matchId ||
    !playerOneAccountId ||
    !playerOneSessionId ||
    !playerTwoAccountId ||
    !playerTwoSessionId ||
    playerOneAccountId ===
      playerTwoAccountId ||
    playerOneSessionId ===
      playerTwoSessionId
  ) {
    const error =
      new Error(
        "Match runtime Cing Artillery không hợp lệ"
      );

    error.code =
      "CING_ARTILLERY_INVALID_MATCH_RUNTIME";

    error.statusCode =
      500;

    throw error;
  }

  return {
    id,

    match_id:
      matchId,

    player_one_account_id:
      playerOneAccountId,

    player_one_session_id:
      playerOneSessionId,

    player_two_account_id:
      playerTwoAccountId,

    player_two_session_id:
      playerTwoSessionId,

    status:
      assertMatchRuntimeStatus(
        row.status
      ),

    initialized_at:
      row.initialized_at || null,

    created_at:
      row.created_at || null,

    updated_at:
      row.updated_at || null,
  };
}

module.exports = {
  CING_ARTILLERY_MATCH_RUNTIME_STATUS,
  assertMatchId,
  assertMatchRuntimeStatus,
  normalizeMatchRuntimeRecord,
};
