const {
  resolveAuthenticatedUserId,
} = require(
  "./cingBlockPuzzleSessionService"
);

const {
  normalizeContinueRequest,
} = require(
  "./domain/cingBlockPuzzleContinueContracts"
);

const {
  getSessionForSubmission,
} = require(
  "./repositories/cingBlockPuzzleSessionRepository"
);

const {
  purchaseGameplayContinue,
} = require(
  "./cingBlockPuzzleContinueService"
);

const {
  purchaseV5GameplayRevive,
} = require(
  "./cingBlockPuzzleV5ReviveService"
);

function createError(
  message,
  code,
  statusCode
) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    statusCode;

  return error;
}

function exactTuple(
  row,
  engine,
  rules,
  score,
  replay
) {
  return (
    row.engine_version === engine &&
    row.rules_version === rules &&
    row.score_version === score &&
    row.replay_version === replay
  );
}

function resolveContinueAuthority(
  row
) {
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row)
  ) {
    throw createError(
      "Session authority không hợp lệ",
      "BLOCK_PUZZLE_CONTINUE_SESSION_INVALID",
      409
    );
  }

  if (
    row.game_key !==
      "cing-block-puzzle"
  ) {
    throw createError(
      "Game session không hợp lệ",
      "BLOCK_PUZZLE_CONTINUE_GAME_INVALID",
      409
    );
  }

  /*
   * Historical Replay V3 and current Replay V4
   * must retain the established loyalty-point
   * financial authority.
   */

  if (
    exactTuple(
      row,
      2,
      2,
      2,
      3
    ) ||
    exactTuple(
      row,
      3,
      3,
      3,
      4
    )
  ) {
    return "legacy";
  }

  /*
   * Exact V5 tuple is the ONLY route to
   * Revive Credit financial authority.
   */

  if (
    exactTuple(
      row,
      4,
      4,
      3,
      5
    )
  ) {
    return "v5";
  }

  throw createError(
    "Phiên bản Continue không được hỗ trợ",
    "BLOCK_PUZZLE_CONTINUE_VERSION_UNSUPPORTED",
    409
  );
}

async function
purchaseVersionedGameplayContinue({
  customer,
  sessionId,
  body,
}) {
  /*
   * This lookup is for routing only.
   *
   * The selected financial service MUST
   * reload and verify its session, user,
   * replay and atomic SQL authority.
   */

  const userId =
    resolveAuthenticatedUserId(
      customer
    );

  const request =
    normalizeContinueRequest({
      sessionId,
      body,
    });

  const row =
    await getSessionForSubmission(
      request.session_id
    );

  if (!row) {
    throw createError(
      "Không tìm thấy ván chơi",
      "BLOCK_PUZZLE_SESSION_NOT_FOUND",
      404
    );
  }

  /*
   * Fail closed before selecting either
   * financial service.
   *
   * The selected service repeats ownership
   * verification against its own fresh read.
   */

  if (
    row.user_id !== userId
  ) {
    throw createError(
      "Bạn không có quyền mua mạng cho ván chơi này",
      "BLOCK_PUZZLE_SESSION_OWNERSHIP_MISMATCH",
      403
    );
  }

  const authority =
    resolveContinueAuthority(
      row
    );

  const args = {
    customer,
    sessionId:
      request.session_id,
    body,
  };

  if (
    authority === "v5"
  ) {
    return purchaseV5GameplayRevive(
      args
    );
  }

  return purchaseGameplayContinue(
    args
  );
}

module.exports = {
  resolveContinueAuthority,
  purchaseVersionedGameplayContinue,
};
