const {
  GAME_KEY,
} = require(
  "./cingBlockPuzzleSessionContracts"
);

const {
  isSupportedEngineContract,
} = require(
  "../engine/cingBlockPuzzleEngineLoader"
);

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SHA256_RE =
  /^[0-9a-f]{64}$/;

const PG_INT_MAX =
  2147483647;

function createContractError(
  message,
  code,
  statusCode = 400
) {
  const error =
    new Error(message);

  error.code = code;
  error.statusCode = statusCode;

  return error;
}

function normalizeSubmissionRequest({
  sessionId,
  body,
}) {
  const normalizedSessionId =
    String(sessionId || "").trim();

  if (
    !UUID_V4_RE.test(
      normalizedSessionId
    )
  ) {
    throw createContractError(
      "session_id không hợp lệ",
      "BLOCK_PUZZLE_INVALID_SESSION_ID"
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw createContractError(
      "Payload submit không hợp lệ",
      "BLOCK_PUZZLE_INVALID_SUBMIT_PAYLOAD"
    );
  }

  const keys =
    Object.keys(body).sort();

  if (
    keys.length !== 1 ||
    keys[0] !== "replay"
  ) {
    throw createContractError(
      "Payload submit chỉ được chứa replay",
      "BLOCK_PUZZLE_INVALID_SUBMIT_PAYLOAD"
    );
  }

  if (
    !body.replay ||
    typeof body.replay !== "object" ||
    Array.isArray(body.replay)
  ) {
    throw createContractError(
      "Replay transcript không hợp lệ",
      "BLOCK_PUZZLE_INVALID_REPLAY"
    );
  }

  return Object.freeze({
    session_id:
      normalizedSessionId,

    replay:
      body.replay,
  });
}

function normalizeTimestamp(
  value,
  fieldName
) {
  if (!value) {
    throw new Error(
      `Cing Block Puzzle ${fieldName} không hợp lệ`
    );
  }

  const timestamp =
    new Date(value);

  if (
    Number.isNaN(
      timestamp.getTime()
    )
  ) {
    throw new Error(
      `Cing Block Puzzle ${fieldName} không hợp lệ`
    );
  }

  return value;
}

function normalizeSubmissionSessionRow(
  row
) {
  if (
    !row ||
    typeof row !== "object"
  ) {
    throw new Error(
      "Cing Block Puzzle submission session row không hợp lệ"
    );
  }

  const session = {
    id:
      String(row.id || ""),

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

    submitted_at:
      row.submitted_at ?? null,

    verified_score:
      row.verified_score ?? null,

    replay_fingerprint:
      row.replay_fingerprint ?? null,

    move_count:
      row.move_count ?? null,
  };

  if (
    !UUID_V4_RE.test(
      session.id
    ) ||
    !session.user_id
  ) {
    throw new Error(
      "Cing Block Puzzle submission session identity không hợp lệ"
    );
  }

  if (
    session.game_key !==
      GAME_KEY
  ) {
    throw new Error(
      "Cing Block Puzzle submission game_key không hợp lệ"
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
      "Cing Block Puzzle submission seed không hợp lệ"
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
      "Cing Block Puzzle submission version không hợp lệ"
    );
  }

  if (
    session.play_cost !== 1
  ) {
    throw new Error(
      "Cing Block Puzzle submission play cost không hợp lệ"
    );
  }

  if (
    ![
      "active",
      "submitted",
      "expired",
    ].includes(
      session.status
    )
  ) {
    throw new Error(
      "Cing Block Puzzle submission lifecycle không hợp lệ"
    );
  }

  normalizeTimestamp(
    session.created_at,
    "created_at"
  );

  normalizeTimestamp(
    session.expires_at,
    "expires_at"
  );

  if (
    session.status ===
      "submitted"
  ) {
    normalizeTimestamp(
      session.submitted_at,
      "submitted_at"
    );

    if (
      !Number.isSafeInteger(
        Number(
          session.verified_score
        )
      ) ||
      Number(
        session.verified_score
      ) < 0 ||
      Number(
        session.verified_score
      ) > PG_INT_MAX
    ) {
      throw new Error(
        "Cing Block Puzzle submitted score không hợp lệ"
      );
    }

    if (
      !SHA256_RE.test(
        String(
          session.replay_fingerprint ||
          ""
        )
      )
    ) {
      throw new Error(
        "Cing Block Puzzle submitted fingerprint không hợp lệ"
      );
    }

    if (
      !Number.isSafeInteger(
        Number(
          session.move_count
        )
      ) ||
      Number(
        session.move_count
      ) <= 0
    ) {
      throw new Error(
        "Cing Block Puzzle submitted move_count không hợp lệ"
      );
    }
  }

  return Object.freeze(
    session
  );
}

function normalizeVerifiedReplayResult(
  result
) {
  if (
    !result ||
    typeof result !== "object"
  ) {
    throw new Error(
      "Cing Block Puzzle verified replay result không hợp lệ"
    );
  }

  const values = {
    verified_score:
      Number(result.score),

    move_count:
      Number(result.move_count),

    best_combo:
      Number(result.best_combo),

    total_lines_cleared:
      Number(
        result.total_lines_cleared
      ),

    replay_fingerprint:
      String(
        result.replay_fingerprint ||
        ""
      ),
  };

  for (const [
    field,
    value,
  ] of [
    [
      "verified_score",
      values.verified_score,
    ],
    [
      "best_combo",
      values.best_combo,
    ],
    [
      "total_lines_cleared",
      values.total_lines_cleared,
    ],
  ]) {
    if (
      !Number.isSafeInteger(
        value
      ) ||
      value < 0 ||
      value > PG_INT_MAX
    ) {
      throw new Error(
        `Cing Block Puzzle ${field} vượt DB contract`
      );
    }
  }

  if (
    !Number.isSafeInteger(
      values.move_count
    ) ||
    values.move_count <= 0 ||
    values.move_count >
      PG_INT_MAX
  ) {
    throw new Error(
      "Cing Block Puzzle move_count vượt DB contract"
    );
  }

  if (
    !SHA256_RE.test(
      values.replay_fingerprint
    )
  ) {
    throw new Error(
      "Cing Block Puzzle replay fingerprint không hợp lệ"
    );
  }

  return Object.freeze(
    values
  );
}

function normalizeSubmitRpcResult(
  row
) {
  if (
    !row ||
    typeof row !== "object"
  ) {
    throw new Error(
      "Cing Block Puzzle submit RPC returned invalid payload"
    );
  }

  const result = {
    session_id:
      String(
        row.session_id || ""
      ),

    score_id:
      String(
        row.score_id || ""
      ),

    verified_score:
      Number(
        row.verified_score
      ),

    replay_fingerprint:
      String(
        row.replay_fingerprint ||
        ""
      ),

    move_count:
      Number(
        row.move_count
      ),

    submitted_at:
      row.submitted_at,

    idempotent:
      row.idempotent,
  };

  if (
    !UUID_V4_RE.test(
      result.session_id
    ) ||
    !result.score_id
  ) {
    throw new Error(
      "Cing Block Puzzle submit RPC identity không hợp lệ"
    );
  }

  if (
    !Number.isSafeInteger(
      result.verified_score
    ) ||
    result.verified_score < 0 ||
    result.verified_score >
      PG_INT_MAX
  ) {
    throw new Error(
      "Cing Block Puzzle submit RPC score không hợp lệ"
    );
  }

  if (
    !SHA256_RE.test(
      result.replay_fingerprint
    )
  ) {
    throw new Error(
      "Cing Block Puzzle submit RPC fingerprint không hợp lệ"
    );
  }

  if (
    !Number.isSafeInteger(
      result.move_count
    ) ||
    result.move_count <= 0
  ) {
    throw new Error(
      "Cing Block Puzzle submit RPC move_count không hợp lệ"
    );
  }

  normalizeTimestamp(
    result.submitted_at,
    "submit RPC submitted_at"
  );

  if (
    typeof result.idempotent !==
      "boolean"
  ) {
    throw new Error(
      "Cing Block Puzzle submit RPC idempotency flag không hợp lệ"
    );
  }

  return Object.freeze(
    result
  );
}

module.exports = {
  PG_INT_MAX,
  normalizeSubmissionRequest,
  normalizeSubmissionSessionRow,
  normalizeVerifiedReplayResult,
  normalizeSubmitRpcResult,
};
