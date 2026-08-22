const {
  resolveAuthenticatedUserId,
} = require(
  "./cingBlockPuzzleSessionService"
);

const {
  getSessionForSubmission,
  submitSessionAtomic,
} = require(
  "./repositories/cingBlockPuzzleSessionRepository"
);

const {
  verifyReplayAuthority,
} = require(
  "./domain/cingBlockPuzzleReplayAuthority"
);

const {
  normalizeSubmissionRequest,
  normalizeSubmissionSessionRow,
  normalizeVerifiedReplayResult,
  normalizeSubmitRpcResult,
} = require(
  "./domain/cingBlockPuzzleSubmissionContracts"
);

function mapReplayError(
  error
) {
  const code =
    String(
      error?.code || ""
    );

  if (
    code ===
      "BLOCK_PUZZLE_REPLAY_NOT_FINISHED" ||
    code ===
      "BLOCK_PUZZLE_REPLAY_SESSION_MISMATCH"
  ) {
    error.statusCode = 409;
    return error;
  }

  if (
    code ===
      "BLOCK_PUZZLE_INVALID_REPLAY" ||
    code ===
      "BLOCK_PUZZLE_REPLAY_LIMIT_EXCEEDED"
  ) {
    error.statusCode = 400;
    return error;
  }

  return error;
}

function mapSubmitRpcError(
  error
) {
  const message =
    String(
      error?.message || ""
    );

  const mappings = [
    [
      "BLOCK_PUZZLE_SESSION_NOT_FOUND",
      404,
    ],
    [
      "BLOCK_PUZZLE_SESSION_OWNERSHIP_MISMATCH",
      403,
    ],
    [
      "BLOCK_PUZZLE_SESSION_EXPIRED",
      409,
    ],
    [
      "BLOCK_PUZZLE_SUBMIT_REPLAY_CONFLICT",
      409,
    ],
    [
      "BLOCK_PUZZLE_SESSION_STATUS_INVALID",
      409,
    ],
    [
      "BLOCK_PUZZLE_SESSION_VERSION_INVALID",
      409,
    ],
    [
      "BLOCK_PUZZLE_SESSION_GAME_KEY_INVALID",
      409,
    ],
    [
      "PLAYER_NOT_FOUND",
      404,
    ],
  ];

  for (const [
    code,
    statusCode,
  ] of mappings) {
    if (
      message.includes(
        code
      )
    ) {
      error.code = code;
      error.statusCode =
        statusCode;

      return error;
    }
  }

  return error;
}

function assertSessionOwnership(
  session,
  userId
) {
  if (
    session.user_id !==
      userId
  ) {
    const error =
      new Error(
        "Bạn không có quyền submit ván chơi này"
      );

    error.code =
      "BLOCK_PUZZLE_SESSION_OWNERSHIP_MISMATCH";

    error.statusCode = 403;

    throw error;
  }
}

function assertSessionCanBeVerified(
  session
) {
  if (
    session.status ===
      "expired"
  ) {
    const error =
      new Error(
        "Ván chơi đã hết hạn"
      );

    error.code =
      "BLOCK_PUZZLE_SESSION_EXPIRED";

    error.statusCode = 409;

    throw error;
  }

  if (
    session.status ===
      "active" &&
    Date.now() >=
      new Date(
        session.expires_at
      ).getTime()
  ) {
    const error =
      new Error(
        "Ván chơi đã hết hạn"
      );

    error.code =
      "BLOCK_PUZZLE_SESSION_EXPIRED";

    error.statusCode = 409;

    throw error;
  }

  /*
   * submitted is intentionally allowed:
   * replay is re-verified server-side and the
   * PostgreSQL authority decides idempotent retry
   * vs replay conflict.
   */
  if (
    session.status !==
      "active" &&
    session.status !==
      "submitted"
  ) {
    const error =
      new Error(
        "Trạng thái ván chơi không hợp lệ"
      );

    error.code =
      "BLOCK_PUZZLE_SESSION_STATUS_INVALID";

    error.statusCode = 409;

    throw error;
  }
}

async function submitGameplaySession({
  customer,
  sessionId,
  body,
}) {
  const userId =
    resolveAuthenticatedUserId(
      customer
    );

  const request =
    normalizeSubmissionRequest({
      sessionId,
      body,
    });

  const rawSession =
    await getSessionForSubmission(
      request.session_id
    );

  if (!rawSession) {
    const error =
      new Error(
        "Không tìm thấy ván chơi"
      );

    error.code =
      "BLOCK_PUZZLE_SESSION_NOT_FOUND";

    error.statusCode = 404;

    throw error;
  }

  const session =
    normalizeSubmissionSessionRow(
      rawSession
    );

  assertSessionOwnership(
    session,
    userId
  );

  assertSessionCanBeVerified(
    session
  );

  let verified;

  try {
    verified =
      await verifyReplayAuthority({
        transcript:
          request.replay,

        expectedSeed:
          session.seed,

        engineVersion:
          session.engine_version,

        rulesVersion:
          session.rules_version,

        scoreVersion:
          session.score_version,

        replayVersion:
          session.replay_version,

        requireEnded:
          true,
      });
  } catch (error) {
    throw mapReplayError(
      error
    );
  }

  const authority =
    normalizeVerifiedReplayResult(
      verified
    );

  let rpcRow;

  try {
    rpcRow =
      await submitSessionAtomic({
        sessionId:
          session.id,

        userId,

        verifiedScore:
          authority.verified_score,

        replayFingerprint:
          authority.replay_fingerprint,

        moveCount:
          authority.move_count,

        bestCombo:
          authority.best_combo,

        totalLinesCleared:
          authority.total_lines_cleared,
      });
  } catch (error) {
    throw mapSubmitRpcError(
      error
    );
  }

  const persisted =
    normalizeSubmitRpcResult(
      rpcRow
    );

  if (
    persisted.session_id !==
      session.id ||
    persisted.verified_score !==
      authority.verified_score ||
    persisted.replay_fingerprint !==
      authority.replay_fingerprint ||
    persisted.move_count !==
      authority.move_count
  ) {
    const error =
      new Error(
        "Cing Block Puzzle submit authority response mismatch"
      );

    error.code =
      "BLOCK_PUZZLE_SUBMIT_AUTHORITY_MISMATCH";

    error.statusCode = 500;

    throw error;
  }

  return persisted;
}

module.exports = {
  submitGameplaySession,
};
