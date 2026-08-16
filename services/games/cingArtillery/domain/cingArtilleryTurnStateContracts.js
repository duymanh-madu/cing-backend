const {
  assertMatchId,
} = require(
  "./cingArtilleryMatchRuntimeContracts"
);

const {
  assertMatchRuntimeId,
  assertCombatStateId,
} = require(
  "./cingArtilleryCombatStateContracts"
);

const CING_ARTILLERY_TURN_STATE_STATUS =
  Object.freeze({
    PENDING:
      "pending",

    ACTIVE:
      "active",
  });

const VALID_TURN_STATE_STATUSES =
  new Set(
    Object.values(
      CING_ARTILLERY_TURN_STATE_STATUS
    )
  );

function buildError({
  message,
  code,
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    500;

  return error;
}

function assertUuid(
  value,
  field
) {
  const normalized =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();

  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

  if (
    !UUID_PATTERN.test(
      normalized
    )
  ) {
    throw buildError({
      message:
        `Turn state Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_TURN_STATE",
    });
  }

  return normalized;
}

function assertTurnStateId(
  value
) {
  return assertUuid(
    value,
    "id"
  );
}

function assertTurnStateStatus(
  value
) {
  const status =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();

  if (
    !VALID_TURN_STATE_STATUSES.has(
      status
    )
  ) {
    throw buildError({
      message:
        "Trạng thái turn state Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_TURN_STATE_STATUS",
    });
  }

  return status;
}

const POSTGRES_INTEGER_MAX =
  2147483647;

function assertTurnNumber(
  value
) {
  if (
    typeof value !== "number"
  ) {
    throw buildError({
      message:
        "Turn number Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_TURN_NUMBER",
    });
  }

  const number =
    value;

  if (
    !Number.isSafeInteger(
      number
    ) ||
    number < 0 ||
    number > POSTGRES_INTEGER_MAX
  ) {
    throw buildError({
      message:
        "Turn number Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_TURN_NUMBER",
    });
  }

  return number;
}

function normalizeTimestamp(
  value,
  field,
  nullable = false
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    if (nullable) {
      return null;
    }

    throw buildError({
      message:
        `Turn state Cing Artillery thiếu ${field}`,
      code:
        "CING_ARTILLERY_INVALID_TURN_STATE",
    });
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw buildError({
      message:
        `Turn state Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_TURN_STATE",
    });
  }

  return date.toISOString();
}

function normalizeTurnStateRecord(
  row
) {
  if (!row) {
    return null;
  }

  const status =
    assertTurnStateStatus(
      row.status
    );

  const turnNumber =
    assertTurnNumber(
      row.turn_number
    );

  const playerOneAccountId =
    assertUuid(
      row.player_one_account_id,
      "player_one_account_id"
    );

  const playerOneSessionId =
    assertUuid(
      row.player_one_session_id,
      "player_one_session_id"
    );

  const playerTwoAccountId =
    assertUuid(
      row.player_two_account_id,
      "player_two_account_id"
    );

  const playerTwoSessionId =
    assertUuid(
      row.player_two_session_id,
      "player_two_session_id"
    );

  if (
    playerOneAccountId ===
      playerTwoAccountId ||
    playerOneSessionId ===
      playerTwoSessionId
  ) {
    throw buildError({
      message:
        "Turn state Cing Artillery có participant authority không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_TURN_STATE",
    });
  }

  const activeAccountId =
    row.active_account_id
      ? assertUuid(
          row.active_account_id,
          "active_account_id"
        )
      : null;

  const activeSessionId =
    row.active_session_id
      ? assertUuid(
          row.active_session_id,
          "active_session_id"
        )
      : null;

  const turnStartedAt =
    normalizeTimestamp(
      row.turn_started_at,
      "turn_started_at",
      true
    );

  const turnDeadlineAt =
    normalizeTimestamp(
      row.turn_deadline_at,
      "turn_deadline_at",
      true
    );

  if (
    status ===
      CING_ARTILLERY_TURN_STATE_STATUS
        .PENDING
  ) {
    if (
      turnNumber !== 0 ||
      activeAccountId !== null ||
      activeSessionId !== null ||
      turnStartedAt !== null ||
      turnDeadlineAt !== null
    ) {
      throw buildError({
        message:
          "Pending turn state Cing Artillery không nhất quán",
        code:
          "CING_ARTILLERY_INVALID_TURN_STATE",
      });
    }
  }

  if (
    status ===
      CING_ARTILLERY_TURN_STATE_STATUS
        .ACTIVE
  ) {
    const activeIsPlayerOne =
      activeAccountId ===
        playerOneAccountId &&
      activeSessionId ===
        playerOneSessionId;

    const activeIsPlayerTwo =
      activeAccountId ===
        playerTwoAccountId &&
      activeSessionId ===
        playerTwoSessionId;

    if (
      turnNumber <= 0 ||
      (
        !activeIsPlayerOne &&
        !activeIsPlayerTwo
      ) ||
      !turnStartedAt ||
      !turnDeadlineAt ||
      new Date(
        turnDeadlineAt
      ).getTime() <=
        new Date(
          turnStartedAt
        ).getTime()
    ) {
      throw buildError({
        message:
          "Active turn state Cing Artillery không nhất quán",
        code:
          "CING_ARTILLERY_INVALID_TURN_STATE",
      });
    }
  }

  return {
    id:
      assertTurnStateId(
        row.id
      ),

    combat_state_id:
      assertCombatStateId(
        row.combat_state_id
      ),

    match_runtime_id:
      assertMatchRuntimeId(
        row.match_runtime_id
      ),

    match_id:
      assertMatchId(
        row.match_id
      ),

    player_one_account_id:
      playerOneAccountId,

    player_one_session_id:
      playerOneSessionId,

    player_two_account_id:
      playerTwoAccountId,

    player_two_session_id:
      playerTwoSessionId,

    status,

    turn_number:
      turnNumber,

    active_account_id:
      activeAccountId,

    active_session_id:
      activeSessionId,

    turn_started_at:
      turnStartedAt,

    turn_deadline_at:
      turnDeadlineAt,

    created_at:
      normalizeTimestamp(
        row.created_at,
        "created_at"
      ),

    updated_at:
      normalizeTimestamp(
        row.updated_at,
        "updated_at"
      ),
  };
}

module.exports = {
  CING_ARTILLERY_TURN_STATE_STATUS,
  assertTurnStateId,
  assertTurnStateStatus,
  assertTurnNumber,
  normalizeTurnStateRecord,
};
