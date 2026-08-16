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

const POSTGRES_INTEGER_MAX =
  2147483647;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function buildError({
  message,
  code,
  statusCode = 400,
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
  code,
  message,
  statusCode = 400
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
      message,
      code,
      statusCode,
    });
  }

  return normalized;
}

function assertShotCommandId(
  value
) {
  return assertUuid(
    value,
    "CING_ARTILLERY_INVALID_SHOT_COMMAND_ID",
    "Shot command ID Cing Artillery không hợp lệ"
  );
}

function assertShooterAccountId(
  value
) {
  return assertUuid(
    value,
    "CING_ARTILLERY_INVALID_SHOOTER_ACCOUNT_ID",
    "Shooter account ID Cing Artillery không hợp lệ"
  );
}

function assertShooterSessionId(
  value
) {
  return assertUuid(
    value,
    "CING_ARTILLERY_INVALID_SHOOTER_SESSION_ID",
    "Shooter session ID Cing Artillery không hợp lệ"
  );
}

function assertShotTurnNumber(
  value
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > POSTGRES_INTEGER_MAX
  ) {
    throw buildError({
      message:
        "Turn number của shot command Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_SHOT_TURN_NUMBER",
    });
  }

  return value;
}

function assertFiniteShotNumber(
  value,
  field,
  code
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw buildError({
      message:
        `Shot command Cing Artillery không hợp lệ: ${field}`,
      code,
    });
  }

  return value;
}

function normalizePersistedShotNumber(
  value,
  field
) {
  /*
   * PostgreSQL numeric may be represented by the client
   * library as either a JS number or a numeric string.
   *
   * Never use unconditional Number(value) here because
   * Number(null), Number("") and whitespace all coerce to 0.
   * A malformed canonical row must fail closed.
   */
  if (
    typeof value === "number"
  ) {
    if (!Number.isFinite(value)) {
      throw buildError({
        message:
          `Shot command Cing Artillery không hợp lệ: ${field}`,
        code:
          "CING_ARTILLERY_INVALID_SHOT_COMMAND",
        statusCode:
          500,
      });
    }

    return value;
  }

  if (
    typeof value === "string"
  ) {
    const normalized =
      value.trim();

    if (!normalized) {
      throw buildError({
        message:
          `Shot command Cing Artillery không hợp lệ: ${field}`,
        code:
          "CING_ARTILLERY_INVALID_SHOT_COMMAND",
        statusCode:
          500,
      });
    }

    const number =
      Number(normalized);

    if (!Number.isFinite(number)) {
      throw buildError({
        message:
          `Shot command Cing Artillery không hợp lệ: ${field}`,
        code:
          "CING_ARTILLERY_INVALID_SHOT_COMMAND",
        statusCode:
          500,
      });
    }

    return number;
  }

  throw buildError({
    message:
      `Shot command Cing Artillery không hợp lệ: ${field}`,
    code:
      "CING_ARTILLERY_INVALID_SHOT_COMMAND",
    statusCode:
      500,
  });
}

function assertShotAngleDeg(
  value
) {
  return assertFiniteShotNumber(
    value,
    "angle_deg",
    "CING_ARTILLERY_INVALID_SHOT_ANGLE"
  );
}

function assertShotPower(
  value
) {
  return assertFiniteShotNumber(
    value,
    "power",
    "CING_ARTILLERY_INVALID_SHOT_POWER"
  );
}

function normalizeTimestamp(
  value,
  field
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    throw buildError({
      message:
        `Shot command Cing Artillery thiếu ${field}`,
      code:
        "CING_ARTILLERY_INVALID_SHOT_COMMAND",
      statusCode:
        500,
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
        `Shot command Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_SHOT_COMMAND",
      statusCode:
        500,
    });
  }

  return date.toISOString();
}

function normalizeShotCommandRecord(
  row
) {
  if (!row) {
    return null;
  }

  return {
    id:
      assertUuid(
        row.id,
        "CING_ARTILLERY_INVALID_SHOT_COMMAND",
        "Shot command Cing Artillery có id không hợp lệ",
        500
      ),

    command_id:
      assertUuid(
        row.command_id,
        "CING_ARTILLERY_INVALID_SHOT_COMMAND",
        "Shot command Cing Artillery có command_id không hợp lệ",
        500
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

    shooter_account_id:
      assertUuid(
        row.shooter_account_id,
        "CING_ARTILLERY_INVALID_SHOT_COMMAND",
        "Shot command Cing Artillery có shooter_account_id không hợp lệ",
        500
      ),

    shooter_session_id:
      assertUuid(
        row.shooter_session_id,
        "CING_ARTILLERY_INVALID_SHOT_COMMAND",
        "Shot command Cing Artillery có shooter_session_id không hợp lệ",
        500
      ),

    angle_deg:
      normalizePersistedShotNumber(
        row.angle_deg,
        "angle_deg"
      ),

    power:
      normalizePersistedShotNumber(
        row.power,
        "power"
      ),

    accepted_at:
      normalizeTimestamp(
        row.accepted_at,
        "accepted_at"
      ),

    created_at:
      normalizeTimestamp(
        row.created_at,
        "created_at"
      ),
  };
}

module.exports = {
  assertShotCommandId,
  assertShooterAccountId,
  assertShooterSessionId,
  assertShotTurnNumber,
  assertShotAngleDeg,
  assertShotPower,
  normalizeShotCommandRecord,
};
