const crypto =
  require("crypto");

const {
  normalizePhone,
} = require(
  "../../../utils/phoneIdentity"
);

const {
  startSessionAtomic,
} = require(
  "./repositories/cingBlockPuzzleSessionRepository"
);

const {
  ENGINE_VERSION,
  RULES_VERSION,
  SCORE_VERSION,
  REPLAY_VERSION,
  SESSION_TTL_SECONDS,
  normalizeSessionRow,
} = require(
  "./domain/cingBlockPuzzleSessionContracts"
);

function resolveAuthenticatedUserId(
  customer
) {
  const phone =
    normalizePhone(
      customer?.phone || ""
    );

  if (!phone) {
    const error =
      new Error(
        "Không xác định được tài khoản thành viên"
      );

    error.statusCode = 401;
    error.code =
      "BLOCK_PUZZLE_MEMBER_IDENTITY_REQUIRED";

    throw error;
  }

  return phone;
}

function normalizeRequestId(
  requestId
) {
  const value =
    String(
      requestId || ""
    ).trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  ) {
    const error =
      new Error(
        "request_id không hợp lệ"
      );

    error.statusCode = 400;
    error.code =
      "BLOCK_PUZZLE_INVALID_REQUEST_ID";

    throw error;
  }

  return value;
}

function createSeed() {
  /*
   * Uniform uint32 domain 1..0xffffffff.
   * Zero is excluded because the deterministic
   * xorshift32 engine normalizes zero specially.
   */
  let seed = 0;

  while (seed === 0) {
    seed =
      crypto
        .randomBytes(4)
        .readUInt32BE(0);
  }

  return seed;
}

async function startGameplaySession({
  customer,
  requestId,
}) {
  const userId =
    resolveAuthenticatedUserId(
      customer
    );

  const normalizedRequestId =
    normalizeRequestId(
      requestId
    );

  const sessionId =
    crypto.randomUUID();

  const seed =
    createSeed();

  let row;

  try {
    row =
      await startSessionAtomic({
        sessionId,
        requestId:
          normalizedRequestId,
        userId,
        seed,
        engineVersion:
          ENGINE_VERSION,
        rulesVersion:
          RULES_VERSION,
        scoreVersion:
          SCORE_VERSION,
        replayVersion:
          REPLAY_VERSION,
        ttlSeconds:
          SESSION_TTL_SECONDS,
      });
  } catch (error) {
    const message =
      String(
        error?.message || ""
      );

    if (
      message.includes(
        "NO_GAME_PLAYS"
      )
    ) {
      error.statusCode = 409;
      error.code =
        "NO_GAME_PLAYS";
    } else if (
      message.includes(
        "GAME_POLICY_NOT_CONFIGURED"
      )
    ) {
      error.statusCode = 409;
      error.code =
        "GAME_POLICY_NOT_CONFIGURED";
    } else if (
      message.includes(
        "PLAYER_NOT_FOUND"
      )
    ) {
      error.statusCode = 404;
      error.code =
        "PLAYER_NOT_FOUND";
    }

    throw error;
  }

  const session =
    normalizeSessionRow(
      row
    );

  if (
    session.user_id !== userId
  ) {
    const error =
      new Error(
        "Cing Block Puzzle session ownership mismatch"
      );

    error.statusCode = 500;
    error.code =
      "BLOCK_PUZZLE_SESSION_OWNERSHIP_MISMATCH";

    throw error;
  }

  return {
    session_id:
      session.id,

    seed:
      session.seed,

    engine_version:
      session.engine_version,

    rules_version:
      session.rules_version,

    score_version:
      session.score_version,

    replay_version:
      session.replay_version,

    play_cost:
      session.play_cost,

    expires_at:
      session.expires_at,
  };
}

module.exports = {
  startGameplaySession,
};
