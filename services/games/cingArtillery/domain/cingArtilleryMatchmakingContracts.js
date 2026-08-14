const {
  assertUserId,
} = require(
  "./cingArtilleryContracts"
);

const {
  assertGameplaySessionId,
} = require(
  "./cingArtilleryGameplaySessionContracts"
);

const CING_ARTILLERY_MATCHMAKING_TICKET_STATUS =
  Object.freeze({
    WAITING:
      "waiting",

    MATCHED:
      "matched",

    CANCELLED:
      "cancelled",
  });

const VALID_MATCHMAKING_TICKET_STATUSES =
  new Set(
    Object.values(
      CING_ARTILLERY_MATCHMAKING_TICKET_STATUS
    )
  );

function assertMatchmakingTicketStatus(
  value
) {
  const status =
    String(
      value || ""
    ).trim();

  if (
    !VALID_MATCHMAKING_TICKET_STATUSES.has(
      status
    )
  ) {
    const error =
      new Error(
        `Trạng thái matchmaking ticket Cing Artillery không hợp lệ: ${status}`
      );

    error.code =
      "CING_ARTILLERY_INVALID_MATCHMAKING_TICKET_STATUS";

    error.statusCode =
      500;

    throw error;
  }

  return status;
}

function normalizeMatchmakingDecision(
  row
) {
  if (!row) {
    return null;
  }

  const ticketId =
    String(
      row.ticket_id || ""
    ).trim();

  const gameplaySessionId =
    String(
      row.gameplay_session_id || ""
    ).trim();

  if (
    !ticketId ||
    !gameplaySessionId
  ) {
    const error =
      new Error(
        "Kết quả matchmaking Cing Artillery không hợp lệ"
      );

    error.code =
      "CING_ARTILLERY_INVALID_MATCHMAKING_DECISION";

    error.statusCode =
      500;

    throw error;
  }

  const status =
    assertMatchmakingTicketStatus(
      row.ticket_status
    );

  const matchId =
    row.match_id
      ? String(
          row.match_id
        ).trim()
      : null;

  const opponentAccountId =
    row.opponent_account_id
      ? String(
          row.opponent_account_id
        ).trim()
      : null;

  const opponentGameplaySessionId =
    row.opponent_gameplay_session_id
      ? String(
          row.opponent_gameplay_session_id
        ).trim()
      : null;

  if (
    status ===
      CING_ARTILLERY_MATCHMAKING_TICKET_STATUS
        .MATCHED &&
    (
      !matchId ||
      !opponentAccountId ||
      !opponentGameplaySessionId
    )
  ) {
    const error =
      new Error(
        "Matchmaking Cing Artillery matched nhưng thiếu match hoặc opponent"
      );

    error.code =
      "CING_ARTILLERY_MATCHMAKING_STATE_INCONSISTENT";

    error.statusCode =
      500;

    throw error;
  }

  if (
    status ===
      CING_ARTILLERY_MATCHMAKING_TICKET_STATUS
        .WAITING &&
    (
      matchId ||
      opponentAccountId ||
      opponentGameplaySessionId
    )
  ) {
    const error =
      new Error(
        "Matchmaking Cing Artillery waiting có dữ liệu match không hợp lệ"
      );

    error.code =
      "CING_ARTILLERY_MATCHMAKING_STATE_INCONSISTENT";

    error.statusCode =
      500;

    throw error;
  }

  return {
    ticket_id:
      ticketId,

    status,

    gameplay_session_id:
      gameplaySessionId,

    match_id:
      matchId,

    opponent_account_id:
      opponentAccountId,

    opponent_gameplay_session_id:
      opponentGameplaySessionId,

    queued_at:
      row.queued_at || null,

    matched_at:
      row.matched_at || null,
  };
}

function assertEnterMatchmakingRequest({
  userId,
  gameplaySessionId,
}) {
  return {
    userId:
      assertUserId(
        userId
      ),

    gameplaySessionId:
      assertGameplaySessionId(
        gameplaySessionId
      ),
  };
}

module.exports = {
  CING_ARTILLERY_MATCHMAKING_TICKET_STATUS,
  assertMatchmakingTicketStatus,
  normalizeMatchmakingDecision,
  assertEnterMatchmakingRequest,
};
