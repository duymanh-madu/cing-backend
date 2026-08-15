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

function assertRulesObject(
  value
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw buildError({
      message:
        "Game rules Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  return value;
}

const POSTGRES_INTEGER_MAX =
  2147483647;

function assertPositiveInteger(
  value,
  field
) {
  if (
    typeof value !== "number"
  ) {
    throw buildError({
      message:
        `Game rules Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  const number =
    value;

  if (
    !Number.isSafeInteger(number) ||
    number <= 0 ||
    number > POSTGRES_INTEGER_MAX
  ) {
    throw buildError({
      message:
        `Game rules Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  return number;
}

function assertPositiveNumber(
  value,
  field
) {
  if (
    typeof value !== "number"
  ) {
    throw buildError({
      message:
        `Game rules Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  const number =
    value;

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    throw buildError({
      message:
        `Game rules Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  return number;
}

function assertFiniteNumber(
  value,
  field
) {
  if (
    typeof value !== "number"
  ) {
    throw buildError({
      message:
        `Game rules Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  const number =
    value;

  if (
    !Number.isFinite(number)
  ) {
    throw buildError({
      message:
        `Game rules Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  return number;
}

function normalizeGameRules(
  rawRules
) {
  const rules =
    assertRulesObject(
      rawRules
    );

  const normalized = {
    version:
      assertPositiveInteger(
        rules.version,
        "version"
      ),

    max_hp:
      assertPositiveNumber(
        rules.max_hp,
        "max_hp"
      ),

    turn_duration_ms:
      assertPositiveNumber(
        rules.turn_duration_ms,
        "turn_duration_ms"
      ),

    gravity:
      assertPositiveNumber(
        rules.gravity,
        "gravity"
      ),

    wind_min:
      assertFiniteNumber(
        rules.wind_min,
        "wind_min"
      ),

    wind_max:
      assertFiniteNumber(
        rules.wind_max,
        "wind_max"
      ),

    angle_min_deg:
      assertFiniteNumber(
        rules.angle_min_deg,
        "angle_min_deg"
      ),

    angle_max_deg:
      assertFiniteNumber(
        rules.angle_max_deg,
        "angle_max_deg"
      ),

    power_min:
      assertFiniteNumber(
        rules.power_min,
        "power_min"
      ),

    power_max:
      assertFiniteNumber(
        rules.power_max,
        "power_max"
      ),

    base_damage:
      assertPositiveNumber(
        rules.base_damage,
        "base_damage"
      ),

    blast_radius:
      assertPositiveNumber(
        rules.blast_radius,
        "blast_radius"
      ),
  };

  if (
    normalized.wind_min >
    normalized.wind_max
  ) {
    throw buildError({
      message:
        "Game rules Cing Artillery không hợp lệ: wind_min > wind_max",
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  if (
    normalized.angle_min_deg >
    normalized.angle_max_deg
  ) {
    throw buildError({
      message:
        "Game rules Cing Artillery không hợp lệ: angle_min_deg > angle_max_deg",
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  if (
    normalized.power_min >
    normalized.power_max
  ) {
    throw buildError({
      message:
        "Game rules Cing Artillery không hợp lệ: power_min > power_max",
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  return Object.freeze(
    normalized
  );
}

function assertRulesVersionMatches({
  rulesVersion,
  rules,
}) {
  const version =
    assertPositiveInteger(
      rulesVersion,
      "rules_version"
    );

  if (
    version !==
    rules.version
  ) {
    throw buildError({
      message:
        "Rules version và rules snapshot Cing Artillery không đồng nhất",
      code:
        "CING_ARTILLERY_RULES_VERSION_MISMATCH",
    });
  }

  return version;
}

module.exports = {
  normalizeGameRules,
  assertRulesVersionMatches,
};
