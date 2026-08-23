const crypto =
  require("crypto");

const {
  publishContinuePurchaseCommitted,
} = require(
  "./cingBlockPuzzleContinuePostCommitService"
);

const {
  resolveAuthenticatedUserId,
} = require(
  "./cingBlockPuzzleSessionService"
);

const {
  getSessionForSubmission,
  purchaseContinueAtomic,
} = require(
  "./repositories/cingBlockPuzzleSessionRepository"
);

const {
  verifyReplayAuthority,
} = require(
  "./domain/cingBlockPuzzleReplayAuthority"
);

const {
  normalizeContinueRequest,
  normalizeContinueSessionRow,
  normalizeContinuePurchaseResult,
} = require(
  "./domain/cingBlockPuzzleContinueContracts"
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
  } else if (
    code ===
      "BLOCK_PUZZLE_INVALID_REPLAY" ||
    code ===
      "BLOCK_PUZZLE_REPLAY_LIMIT_EXCEEDED"
  ) {
    error.statusCode = 400;
  }

  return error;
}

function mapPurchaseError(
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
      "PLAYER_NOT_FOUND",
      404,
    ],
    [
      "BLOCK_PUZZLE_INSUFFICIENT_POINTS",
      409,
    ],
    [
      "BLOCK_PUZZLE_CONTINUE_LIMIT_REACHED",
      409,
    ],
    [
      "BLOCK_PUZZLE_CONTINUE_INDEX_CONFLICT",
      409,
    ],
    [
      "BLOCK_PUZZLE_CONTINUE_REQUEST_CONFLICT",
      409,
    ],
    [
      "BLOCK_PUZZLE_CONTINUE_REQUIRES_REPLAY_V3",
      409,
    ],
    [
      "BLOCK_PUZZLE_SESSION_EXPIRED",
      409,
    ],
    [
      "BLOCK_PUZZLE_SESSION_STATUS_INVALID",
      409,
    ],
  ];

  for (
    const [
      code,
      statusCode,
    ] of mappings
  ) {
    if (
      message.includes(
        code
      )
    ) {
      error.code =
        code;

      error.statusCode =
        statusCode;

      if (
        code ===
          "BLOCK_PUZZLE_INSUFFICIENT_POINTS"
      ) {
        let detail = null;

        try {
          detail =
            JSON.parse(
              String(
                error?.details ||
                error?.detail ||
                ""
              )
            );
        } catch {}

        const requiredPoints =
          Number(
            detail?.required_points
          );

        const currentPoints =
          Number(
            detail?.current_points
          );

        if (
          Number.isSafeInteger(
            requiredPoints
          ) &&
          requiredPoints > 0 &&
          Number.isSafeInteger(
            currentPoints
          ) &&
          currentPoints >= 0
        ) {
          error.message =
            `Bạn không đủ điểm để mua mạng này. ` +
            `Cần ${requiredPoints} điểm, ` +
            `bạn hiện có ${currentPoints} điểm.`;

          error.data = {
            required_points:
              requiredPoints,

            current_points:
              currentPoints,
          };
        } else {
          error.message =
            "Bạn không đủ điểm để mua mạng này.";
        }
      }

      return error;
    }
  }

  return error;
}

async function purchaseGameplayContinue({
  customer,
  sessionId,
  body,
}) {
  const userId =
    resolveAuthenticatedUserId(
      customer
    );

  const request =
    normalizeContinueRequest({
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

    error.statusCode =
      404;

    throw error;
  }

  const session =
    normalizeContinueSessionRow(
      rawSession
    );

  if (
    session.user_id !==
      userId
  ) {
    const error =
      new Error(
        "Bạn không có quyền mua mạng cho ván chơi này"
      );

    error.code =
      "BLOCK_PUZZLE_SESSION_OWNERSHIP_MISMATCH";

    error.statusCode =
      403;

    throw error;
  }

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

  const continuesUsed =
    Number(
      verified.continues_used
    );

  if (
    !Number.isSafeInteger(
      continuesUsed
    ) ||
    continuesUsed < 0 ||
    continuesUsed > 3
  ) {
    const error =
      new Error(
        "Replay continue authority không hợp lệ"
      );

    error.code =
      "BLOCK_PUZZLE_CONTINUE_REPLAY_INVALID";

    error.statusCode =
      400;

    throw error;
  }

  /*
   * The transcript is a terminal prefix BEFORE the new
   * continue event is appended. Therefore it must contain
   * exactly the continues that were already purchased.
   */
  if (
    continuesUsed !==
      session.continue_count
  ) {
    const error =
      new Error(
        "Replay continue không khớp giao dịch mua mạng"
      );

    error.code =
      "BLOCK_PUZZLE_CONTINUE_PURCHASE_MISMATCH";

    error.statusCode =
      409;

    throw error;
  }

  if (
    session.continue_count >= 3
  ) {
    const error =
      new Error(
        "Bạn đã sử dụng tối đa 3 mạng"
      );

    error.code =
      "BLOCK_PUZZLE_CONTINUE_LIMIT_REACHED";

    error.statusCode =
      409;

    throw error;
  }

  const expectedContinueIndex =
    session.continue_count + 1;

  let rpcRow;

  try {
    rpcRow =
      await purchaseContinueAtomic({
        purchaseId:
          crypto.randomUUID(),

        requestId:
          request.request_id,

        sessionId:
          session.id,

        userId,

        expectedContinueIndex,
      });
  } catch (error) {
    throw mapPurchaseError(
      error
    );
  }

  const persisted =
    normalizeContinuePurchaseResult(
      rpcRow
    );

  if (
    persisted.session_id !==
      session.id ||
    persisted.continue_index !==
      expectedContinueIndex
  ) {
    const error =
      new Error(
        "Cing Block Puzzle continue authority response mismatch"
      );

    error.code =
      "BLOCK_PUZZLE_CONTINUE_AUTHORITY_MISMATCH";

    error.statusCode =
      500;

    throw error;
  }

  /*
   * No iPOS/network mutation here.
   *
   * PostgreSQL debit is already committed. B4 will add the
   * durable post-commit delivery worker using this purchase
   * row as the idempotent delivery source.
   */
  await publishContinuePurchaseCommitted({
    userId,
    balanceAfter:
      persisted.balance_after,
  });

  return persisted;
}

module.exports = {
  purchaseGameplayContinue,
};
