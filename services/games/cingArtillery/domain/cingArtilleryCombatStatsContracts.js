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

const POSTGRES_INTEGER_MAX =
  2147483647;

function assertPositiveNumber(
  value,
  field
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw buildError({
      message:
        `Combat stat Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_COMBAT_STATS",
    });
  }

  return value;
}

function assertPositiveInteger(
  value,
  field
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > POSTGRES_INTEGER_MAX
  ) {
    throw buildError({
      message:
        `Combat stat Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_COMBAT_STATS",
    });
  }

  return value;
}

function normalizeCombatStats(
  value
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw buildError({
      message:
        "Combat stats Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_COMBAT_STATS",
    });
  }

  return Object.freeze({
    /*
     * max_hp mirrors the canonical game-rules contract:
     * positive finite number.
     *
     * It is resolved from rules_snapshot, never from
     * mutable character state.
     */
    max_hp:
      assertPositiveNumber(
        value.max_hp,
        "max_hp"
      ),

    /*
     * Persistent character attributes use PostgreSQL
     * integer columns and therefore preserve exact
     * integer-domain parity here.
     */
    attack:
      assertPositiveInteger(
        value.attack,
        "attack"
      ),

    defense:
      assertPositiveInteger(
        value.defense,
        "defense"
      ),

    speed:
      assertPositiveInteger(
        value.speed,
        "speed"
      ),
  });
}

module.exports = {
  normalizeCombatStats,
};
