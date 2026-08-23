const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createError(
  message,
  code,
  statusCode = 400
) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    statusCode;

  return error;
}

function normalizeContinueRequest({
  sessionId,
  body,
}) {
  const normalizedSessionId =
    String(
      sessionId || ""
    ).trim();

  if (
    !UUID_V4_RE.test(
      normalizedSessionId
    )
  ) {
    throw createError(
      "session_id không hợp lệ",
      "BLOCK_PUZZLE_INVALID_SESSION_ID"
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw createError(
      "Payload mua mạng không hợp lệ",
      "BLOCK_PUZZLE_INVALID_CONTINUE_PAYLOAD"
    );
  }

  const keys =
    Object.keys(
      body
    ).sort();

  if (
    keys.length !== 2 ||
    keys[0] !== "replay" ||
    keys[1] !== "request_id"
  ) {
    throw createError(
      "Payload mua mạng chỉ được chứa request_id và replay",
      "BLOCK_PUZZLE_INVALID_CONTINUE_PAYLOAD"
    );
  }

  const requestId =
    String(
      body.request_id || ""
    ).trim();

  if (
    !UUID_V4_RE.test(
      requestId
    )
  ) {
    throw createError(
      "request_id không hợp lệ",
      "BLOCK_PUZZLE_INVALID_REQUEST_ID"
    );
  }

  if (
    !body.replay ||
    typeof body.replay !==
      "object" ||
    Array.isArray(
      body.replay
    )
  ) {
    throw createError(
      "Replay transcript không hợp lệ",
      "BLOCK_PUZZLE_INVALID_REPLAY"
    );
  }

  return Object.freeze({
    session_id:
      normalizedSessionId,

    request_id:
      requestId,

    replay:
      body.replay,
  });
}

function normalizeContinueSessionRow(
  row
) {
  if (
    !row ||
    typeof row !== "object"
  ) {
    throw new Error(
      "Cing Block Puzzle continue session row không hợp lệ"
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

    status:
      String(row.status || ""),

    expires_at:
      row.expires_at,

    continue_count:
      Number(row.continue_count),
  };

  if (
    !UUID_V4_RE.test(
      session.id
    ) ||
    !session.user_id
  ) {
    throw new Error(
      "Cing Block Puzzle continue session identity không hợp lệ"
    );
  }

  if (
    session.game_key !==
      "cing-block-puzzle"
  ) {
    throw new Error(
      "Cing Block Puzzle continue game_key không hợp lệ"
    );
  }

  if (
    session.engine_version !== 2 ||
    session.rules_version !== 2 ||
    session.score_version !== 2 ||
    session.replay_version !== 3
  ) {
    throw createError(
      "Mạng chơi chỉ hỗ trợ Replay V3",
      "BLOCK_PUZZLE_CONTINUE_REQUIRES_REPLAY_V3",
      409
    );
  }

  if (
    session.status !==
      "active"
  ) {
    throw createError(
      "Trạng thái ván chơi không hợp lệ để mua mạng",
      "BLOCK_PUZZLE_SESSION_STATUS_INVALID",
      409
    );
  }

  const expiresAtMs =
    new Date(
      session.expires_at
    ).getTime();

  if (
    !Number.isFinite(
      expiresAtMs
    ) ||
    Date.now() >=
      expiresAtMs
  ) {
    throw createError(
      "Ván chơi đã hết hạn",
      "BLOCK_PUZZLE_SESSION_EXPIRED",
      409
    );
  }

  if (
    !Number.isSafeInteger(
      session.continue_count
    ) ||
    session.continue_count < 0 ||
    session.continue_count > 3
  ) {
    throw new Error(
      "Cing Block Puzzle continue_count authority không hợp lệ"
    );
  }

  return Object.freeze(
    session
  );
}

function normalizeContinuePurchaseResult(
  row
) {
  if (
    !row ||
    typeof row !== "object"
  ) {
    throw new Error(
      "Cing Block Puzzle continue purchase response không hợp lệ"
    );
  }

  const result = {
    purchase_id:
      String(
        row.purchase_id || ""
      ),

    session_id:
      String(
        row.session_id || ""
      ),

    continue_index:
      Number(
        row.continue_index
      ),

    points_cost:
      Number(
        row.points_cost
      ),

    balance_before:
      Number(
        row.balance_before
      ),

    balance_after:
      Number(
        row.balance_after
      ),

    continue_count:
      Number(
        row.continue_count
      ),

    created_at:
      row.created_at,

    idempotent:
      row.idempotent ===
      true,
  };

  if (
    !UUID_V4_RE.test(
      result.purchase_id
    ) ||
    !UUID_V4_RE.test(
      result.session_id
    )
  ) {
    throw new Error(
      "Cing Block Puzzle continue purchase identity không hợp lệ"
    );
  }

  if (
    !Number.isSafeInteger(
      result.continue_index
    ) ||
    result.continue_index < 1 ||
    result.continue_index > 3
  ) {
    throw new Error(
      "Cing Block Puzzle continue index response không hợp lệ"
    );
  }

  const expectedCost =
    [
      0,
      5,
      10,
      20,
    ][
      result.continue_index
    ];

  if (
    result.points_cost !==
      expectedCost
  ) {
    throw new Error(
      "Cing Block Puzzle continue cost response không hợp lệ"
    );
  }

  for (
    const field of [
      "balance_before",
      "balance_after",
      "continue_count",
    ]
  ) {
    if (
      !Number.isSafeInteger(
        result[field]
      ) ||
      result[field] < 0
    ) {
      throw new Error(
        `Cing Block Puzzle ${field} response không hợp lệ`
      );
    }
  }

  if (
    result.continue_count !==
      result.continue_index ||
    result.balance_after !==
      result.balance_before -
        result.points_cost
  ) {
    throw new Error(
      "Cing Block Puzzle continue purchase invariant mismatch"
    );
  }

  return Object.freeze(
    result
  );
}

module.exports = {
  normalizeContinueRequest,
  normalizeContinueSessionRow,
  normalizeContinuePurchaseResult,
};
