const GAME_KEY =
  "cing-block-puzzle";

const ENGINE_VERSION = 1;
const RULES_VERSION = 1;
const SCORE_VERSION = 1;
const REPLAY_VERSION = 1;

const SESSION_TTL_SECONDS =
  24 * 60 * 60;

const {
  isSupportedEngineContract,
} = require(
  "../engine/cingBlockPuzzleEngineLoader"
);

function assertStartSessionLifecycle(
  row,
  nowMs = Date.now()
) {
  if (
    !row ||
    typeof row !== "object"
  ) {
    return;
  }

  const status =
    String(
      row.status || ""
    );

  const expiresAtMs =
    new Date(
      row.expires_at
    ).getTime();

  if (
    status === "expired" ||
    (
      status === "active" &&
      Number.isFinite(
        expiresAtMs
      ) &&
      Number.isFinite(
        nowMs
      ) &&
      nowMs >=
        expiresAtMs
    )
  ) {
    const error =
      new Error(
        "Ván chơi đã hết hạn"
      );

    error.code =
      "BLOCK_PUZZLE_SESSION_EXPIRED";

    error.statusCode =
      409;

    throw error;
  }

  /*
   * An idempotent start retry may return the
   * original DB row in any terminal status.
   *
   * Starting is allowed to recover only an
   * authoritative active session. A submitted
   * session must continue through submit/replay
   * idempotency, never through start authority.
   */
  if (
    status &&
    status !== "active"
  ) {
    const error =
      new Error(
        "Trạng thái ván chơi không hợp lệ để bắt đầu"
      );

    error.code =
      "BLOCK_PUZZLE_SESSION_STATUS_INVALID";

    error.statusCode =
      409;

    throw error;
  }
}

function normalizeSessionRow(row) {
  if (
    !row ||
    typeof row !== "object"
  ) {
    throw new TypeError(
      "Cing Block Puzzle session row không hợp lệ"
    );
  }

  const session = {
    id:
      String(row.id || ""),

    request_id:
      String(row.request_id || ""),

    user_id:
      String(row.user_id || ""),

    game_key:
      String(row.game_key || ""),

    seed:
      Number(row.seed),

    engine_version:
      Number(row.engine_version),

    rules_version:
      Number(row.rules_version),

    score_version:
      Number(row.score_version),

    replay_version:
      Number(row.replay_version),

    play_cost:
      Number(row.play_cost),

    status:
      String(row.status || ""),

    created_at:
      row.created_at,

    expires_at:
      row.expires_at,
  };

  if (
    !session.id ||
    !session.request_id ||
    !session.user_id
  ) {
    throw new Error(
      "Cing Block Puzzle session identity không hợp lệ"
    );
  }

  if (
    session.game_key !== GAME_KEY
  ) {
    throw new Error(
      "Cing Block Puzzle session game_key không hợp lệ"
    );
  }

  if (
    !Number.isSafeInteger(
      session.seed
    ) ||
    session.seed < 1 ||
    session.seed > 0xffffffff
  ) {
    throw new Error(
      "Cing Block Puzzle session seed không hợp lệ"
    );
  }

  if (
    !isSupportedEngineContract({
      engineVersion:
        session.engine_version,

      rulesVersion:
        session.rules_version,

      scoreVersion:
        session.score_version,

      replayVersion:
        session.replay_version,
    })
  ) {
    throw new Error(
      "Cing Block Puzzle session version không hợp lệ"
    );
  }

  if (
    session.play_cost !== 1
  ) {
    throw new Error(
      "Cing Block Puzzle session play cost không hợp lệ"
    );
  }

  if (
    session.status !== "active"
  ) {
    throw new Error(
      "Cing Block Puzzle session mới phải active"
    );
  }

  if (
    !session.created_at ||
    !session.expires_at
  ) {
    throw new Error(
      "Cing Block Puzzle session lifecycle timestamp không hợp lệ"
    );
  }

  return Object.freeze(
    session
  );
}

module.exports = {
  GAME_KEY,
  ENGINE_VERSION,
  RULES_VERSION,
  SCORE_VERSION,
  REPLAY_VERSION,
  SESSION_TTL_SECONDS,
  assertStartSessionLifecycle,
  normalizeSessionRow,
};
