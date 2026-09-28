const crypto =
  require("node:crypto");

const {
  resolveAuthenticatedUserId,
} = require(
  "./cingBlockPuzzleSessionService"
);

const {
  getSessionForSubmission,
} = require(
  "./repositories/cingBlockPuzzleSessionRepository"
);

const {
  normalizeContinueRequest,
} = require(
  "./domain/cingBlockPuzzleContinueContracts"
);

const {
  normalizeV5ReviveSessionRow,
  normalizeV5ReviveResult,
} = require(
  "./domain/cingBlockPuzzleV5ReviveContracts"
);

const {
  verifyReplayAuthority,
} = require(
  "./domain/cingBlockPuzzleReplayAuthority"
);

const {
  applyV5ReviveAtomic,
} = require(
  "./repositories/cingBlockPuzzleV5ReviveRepository"
);

const SHA256_RE =
  /^[0-9a-f]{64}$/;

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

function mapV5ReplayError(error) {
  const code =
    String(error?.code || "");

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

function mapV5ReviveError(error) {
  const message =
    String(error?.message || "");

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
      "INSUFFICIENT_REVIVE_CREDITS",
      409,
    ],
    [
      "BLOCK_PUZZLE_CONTINUE_LIMIT_REACHED",
      409,
    ],
    [
      "BLOCK_PUZZLE_V5_REVIVE_INDEX_CONFLICT",
      409,
    ],
    [
      "BLOCK_PUZZLE_V5_REVIVE_REQUEST_CONFLICT",
      409,
    ],
    [
      "BLOCK_PUZZLE_V5_REVIVE_SESSION_CONTRACT_INVALID",
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
    [
      "BLOCK_PUZZLE_V5_REVIVE_INVALID_INPUT",
      400,
    ],
  ];

  for (
    const [
      code,
      statusCode,
    ] of mappings
  ) {
    if (
      message.includes(code)
    ) {
      error.code =
        code;

      error.statusCode =
        statusCode;

      if (
        code ===
          "INSUFFICIENT_REVIVE_CREDITS"
      ) {
        error.message =
          "Bạn không đủ lượt hồi sinh để tiếp tục ván chơi.";
      }

      return error;
    }
  }

  return error;
}

async function purchaseV5GameplayRevive({
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
    throw createError(
      "Không tìm thấy ván chơi",
      "BLOCK_PUZZLE_SESSION_NOT_FOUND",
      404
    );
  }

  const session =
    normalizeV5ReviveSessionRow(
      rawSession
    );

  if (
    session.user_id !== userId
  ) {
    throw createError(
      "Bạn không có quyền hồi sinh trong ván này",
      "BLOCK_PUZZLE_SESSION_OWNERSHIP_MISMATCH",
      403
    );
  }

  /*
   * Financial authority must never accept
   * a client-provided replay fingerprint.
   *
   * The backend verifies the entire terminal
   * replay against the durable session seed
   * and exact V5 engine tuple.
   */

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
    throw mapV5ReplayError(
      error
    );
  }

  const continuesUsed =
    verified?.continues_used;

  const fingerprint =
    verified?.replay_fingerprint;

  if (
    !Number.isSafeInteger(
      continuesUsed
    ) ||
    continuesUsed < 0 ||
    continuesUsed > 5 ||
    typeof fingerprint !==
      "string" ||
    !SHA256_RE.test(
      fingerprint
    )
  ) {
    throw createError(
      "Replay V5 authority không hợp lệ",
      "BLOCK_PUZZLE_V5_REVIVE_REPLAY_INVALID",
      400
    );
  }

  /*
   * Replay is a terminal prefix immediately
   * BEFORE the requested Continue event.
   *
   * For a new purchase:
   *   continuesUsed = session.continue_count
   *
   * For an historical retry:
   *   continuesUsed < session.continue_count
   *
   * SQL determines whether the historical
   * request_id/fingerprint already exists.
   */

  if (
    continuesUsed >
      session.continue_count
  ) {
    throw createError(
      "Replay chứa lượt hồi sinh chưa được ghi nhận",
      "BLOCK_PUZZLE_CONTINUE_PURCHASE_MISMATCH",
      409
    );
  }

  const expectedContinueIndex =
    continuesUsed + 1;

  /*
   * A prefix containing five Continues asks
   * for a sixth one. No RPC may be called.
   */

  if (
    expectedContinueIndex > 5
  ) {
    throw createError(
      "Bạn đã sử dụng tối đa 5 mạng",
      "BLOCK_PUZZLE_CONTINUE_LIMIT_REACHED",
      409
    );
  }

  /*
   * Do not block submitted/expired sessions
   * here. A committed request may be retried.
   *
   * SQL checks the durable receipt first,
   * then rejects NEW purchases when the
   * session is no longer eligible.
   */

  let rpcRow;

  try {
    rpcRow =
      await applyV5ReviveAtomic({
        purchaseId:
          crypto.randomUUID(),

        requestId:
          request.request_id,

        sessionId:
          session.id,

        userId,

        expectedContinueIndex,

        verifiedReplayFingerprint:
          fingerprint,
      });
  } catch (error) {
    throw mapV5ReviveError(
      error
    );
  }

  const persisted =
    normalizeV5ReviveResult(
      rpcRow
    );

  if (
    persisted.session_id !==
      session.id ||
    persisted.continue_index !==
      expectedContinueIndex ||
    persisted.verified_replay_fingerprint !==
      fingerprint
  ) {
    throw createError(
      "Block Puzzle V5 financial receipt không khớp replay authority",
      "BLOCK_PUZZLE_V5_REVIVE_AUTHORITY_MISMATCH",
      500
    );
  }

  /*
   * No legacy point-balance publication.
   * No iPOS, Wallet or network mutation.
   */

  return persisted;
}

module.exports = {
  purchaseV5GameplayRevive,
};
