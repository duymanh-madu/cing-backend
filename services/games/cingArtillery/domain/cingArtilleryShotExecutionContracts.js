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

const {
  assertTurnStateId,
} = require(
  "./cingArtilleryTurnStateContracts"
);

const {
  assertShotCommandId,
  assertShotTurnNumber,
} = require(
  "./cingArtilleryShotCommandContracts"
);

const CING_ARTILLERY_SHOT_EXECUTION_STATUS =
  Object.freeze({
    PENDING:
      "pending",

    PROCESSING:
      "processing",

    COMPLETED:
      "completed",
  });

const VALID_EXECUTION_STATUSES =
  new Set(
    Object.values(
      CING_ARTILLERY_SHOT_EXECUTION_STATUS
    )
  );

const POSTGRES_INTEGER_MAX =
  2147483647;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function buildError({
  message,
  code,
  statusCode = 500,
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    statusCode;

  return error;
}

function assertUuid(
  value,
  field,
  code =
    "CING_ARTILLERY_INVALID_SHOT_EXECUTION"
) {
  const normalized =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();

  if (
    !UUID_PATTERN.test(
      normalized
    )
  ) {
    throw buildError({
      message:
        `Shot execution Cing Artillery không hợp lệ: ${field}`,
      code,
    });
  }

  return normalized;
}

function assertShotExecutionId(
  value
) {
  return assertUuid(
    value,
    "id",
    "CING_ARTILLERY_INVALID_SHOT_EXECUTION_ID"
  );
}

function assertClaimToken(
  value
) {
  return assertUuid(
    value,
    "claim_token",
    "CING_ARTILLERY_INVALID_SHOT_EXECUTION_CLAIM_TOKEN"
  );
}

function assertShotExecutionStatus(
  value
) {
  const status =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();

  if (
    !VALID_EXECUTION_STATUSES.has(
      status
    )
  ) {
    throw buildError({
      message:
        "Trạng thái shot execution Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_SHOT_EXECUTION_STATUS",
    });
  }

  return status;
}

function assertAttemptCount(
  value
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > POSTGRES_INTEGER_MAX
  ) {
    throw buildError({
      message:
        "Attempt count shot execution Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_SHOT_EXECUTION",
    });
  }

  return value;
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
        `Shot execution Cing Artillery thiếu ${field}`,
      code:
        "CING_ARTILLERY_INVALID_SHOT_EXECUTION",
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
        `Shot execution Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_SHOT_EXECUTION",
    });
  }

  return date.toISOString();
}

function normalizeNullableText(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return String(value);
}

function normalizeShotExecutionRecord(
  row
) {
  if (!row) {
    return null;
  }

  const status =
    assertShotExecutionStatus(
      row.status
    );

  const claimToken =
    row.claim_token
      ? assertClaimToken(
          row.claim_token
        )
      : null;

  const claimedAt =
    normalizeTimestamp(
      row.claimed_at,
      "claimed_at",
      true
    );

  const lockedUntil =
    normalizeTimestamp(
      row.locked_until,
      "locked_until",
      true
    );

  const completedAt =
    normalizeTimestamp(
      row.completed_at,
      "completed_at",
      true
    );

  if (
    status ===
      CING_ARTILLERY_SHOT_EXECUTION_STATUS
        .PENDING
  ) {
    if (
      claimToken !== null ||
      claimedAt !== null ||
      lockedUntil !== null ||
      completedAt !== null
    ) {
      throw buildError({
        message:
          "Pending shot execution Cing Artillery không nhất quán",
        code:
          "CING_ARTILLERY_INVALID_SHOT_EXECUTION",
      });
    }
  }

  if (
    status ===
      CING_ARTILLERY_SHOT_EXECUTION_STATUS
        .PROCESSING
  ) {
    if (
      !claimToken ||
      !claimedAt ||
      !lockedUntil ||
      completedAt !== null ||
      new Date(
        lockedUntil
      ).getTime() <=
        new Date(
          claimedAt
        ).getTime()
    ) {
      throw buildError({
        message:
          "Processing shot execution Cing Artillery không nhất quán",
        code:
          "CING_ARTILLERY_INVALID_SHOT_EXECUTION",
      });
    }
  }

  if (
    status ===
      CING_ARTILLERY_SHOT_EXECUTION_STATUS
        .COMPLETED
  ) {
    if (
      !claimToken ||
      !claimedAt ||
      lockedUntil !== null ||
      !completedAt ||
      new Date(
        completedAt
      ).getTime() <
        new Date(
          claimedAt
        ).getTime()
    ) {
      throw buildError({
        message:
          "Completed shot execution Cing Artillery không nhất quán",
        code:
          "CING_ARTILLERY_INVALID_SHOT_EXECUTION",
      });
    }
  }

  return {
    id:
      assertShotExecutionId(
        row.id
      ),

    shot_command_id:
      assertShotCommandId(
        row.shot_command_id
      ),

    combat_state_id:
      assertCombatStateId(
        row.combat_state_id
      ),

    turn_state_id:
      assertTurnStateId(
        row.turn_state_id
      ),

    match_runtime_id:
      assertMatchRuntimeId(
        row.match_runtime_id
      ),

    match_id:
      assertMatchId(
        row.match_id
      ),

    turn_number:
      assertShotTurnNumber(
        row.turn_number
      ),

    status,

    attempt_count:
      assertAttemptCount(
        row.attempt_count
      ),

    claim_token:
      claimToken,

    claimed_at:
      claimedAt,

    locked_until:
      lockedUntil,

    last_error:
      normalizeNullableText(
        row.last_error
      ),

    completed_at:
      completedAt,

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
  CING_ARTILLERY_SHOT_EXECUTION_STATUS,
  assertShotExecutionId,
  assertClaimToken,
  normalizeShotExecutionRecord,
};
