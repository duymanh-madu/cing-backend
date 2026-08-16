const {
  assertCombatStateId,
  assertMatchRuntimeId,
} = require(
  "./cingArtilleryCombatStateContracts"
);

const {
  assertMatchId,
} = require(
  "./cingArtilleryMatchRuntimeContracts"
);

function buildInvariantError({
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

function normalizeUuid(
  value,
  code,
  message
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
    throw buildInvariantError({
      message,
      code,
    });
  }

  return normalized;
}

function normalizeCanonicalAccountId(
  value,
  playerLabel
) {
  return normalizeUuid(
    value,
    "CING_ARTILLERY_COMBAT_VITAL_ACCOUNT_ID_INVALID",
    `Combat Vital ${playerLabel} account không hợp lệ`
  );
}

function normalizeFiniteNonNegativeHp(
  value,
  playerLabel
) {
  const normalized =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isFinite(
      normalized
    ) ||
    normalized < 0
  ) {
    throw buildInvariantError({
      message:
        `Combat Vital ${playerLabel} HP không hợp lệ`,
      code:
        "CING_ARTILLERY_COMBAT_VITAL_HP_INVALID",
    });
  }

  return normalized;
}

function normalizeCombatVitalRecord(
  row
) {
  if (!row) {
    return null;
  }

  const playerOneAccountId =
    normalizeCanonicalAccountId(
      row.player_one_account_id,
      "player one"
    );

  const playerTwoAccountId =
    normalizeCanonicalAccountId(
      row.player_two_account_id,
      "player two"
    );

  if (
    playerOneAccountId ===
    playerTwoAccountId
  ) {
    throw buildInvariantError({
      message:
        "Combat Vital chứa hai player trùng account",
      code:
        "CING_ARTILLERY_COMBAT_VITAL_ACCOUNTS_INCONSISTENT",
    });
  }

  return {
    id:
      normalizeUuid(
        row.id,
        "CING_ARTILLERY_COMBAT_VITAL_ID_INVALID",
        "Combat Vital ID không hợp lệ"
      ),

    combat_state_id:
      (() => {
        try {
          return assertCombatStateId(
            row.combat_state_id
          );
        } catch (error) {
          throw buildInvariantError({
            message:
              "Combat Vital combat_state_id không hợp lệ",
            code:
              "CING_ARTILLERY_COMBAT_VITAL_COMBAT_STATE_ID_INVALID",
          });
        }
      })(),

    match_runtime_id:
      (() => {
        try {
          return assertMatchRuntimeId(
            row.match_runtime_id
          );
        } catch (error) {
          throw buildInvariantError({
            message:
              "Combat Vital match_runtime_id không hợp lệ",
            code:
              "CING_ARTILLERY_COMBAT_VITAL_MATCH_RUNTIME_ID_INVALID",
          });
        }
      })(),

    match_id:
      (() => {
        try {
          return assertMatchId(
            row.match_id
          );
        } catch (error) {
          throw buildInvariantError({
            message:
              "Combat Vital match_id không hợp lệ",
            code:
              "CING_ARTILLERY_COMBAT_VITAL_MATCH_ID_INVALID",
          });
        }
      })(),

    player_one_account_id:
      playerOneAccountId,

    player_two_account_id:
      playerTwoAccountId,

    player_one_current_hp:
      normalizeFiniteNonNegativeHp(
        row.player_one_current_hp,
        "player one"
      ),

    player_two_current_hp:
      normalizeFiniteNonNegativeHp(
        row.player_two_current_hp,
        "player two"
      ),

    initialized_at:
      row.initialized_at,

    updated_at:
      row.updated_at,

    created_at:
      row.created_at,
  };
}

module.exports = {
  normalizeCombatVitalRecord,
};
