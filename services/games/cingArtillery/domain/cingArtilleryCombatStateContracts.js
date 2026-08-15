const {
  assertMatchId,
} = require(
  "./cingArtilleryMatchRuntimeContracts"
);

const {
  normalizeGameRules,
  assertRulesVersionMatches,
} = require(
  "./cingArtilleryGameRulesContracts"
);

const CING_ARTILLERY_COMBAT_STATE_STATUS =
  Object.freeze({
    INITIALIZED:
      "initialized",
  });

const VALID_COMBAT_STATE_STATUSES =
  new Set(
    Object.values(
      CING_ARTILLERY_COMBAT_STATE_STATUS
    )
  );

function assertUuid(
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
    const error =
      new Error(message);

    error.code =
      code;

    error.statusCode =
      400;

    throw error;
  }

  return normalized;
}

function assertMatchRuntimeId(
  value
) {
  return assertUuid(
    value,
    "CING_ARTILLERY_INVALID_MATCH_RUNTIME_ID",
    "Match runtime Cing Artillery không hợp lệ"
  );
}

function assertCombatStateId(
  value
) {
  return assertUuid(
    value,
    "CING_ARTILLERY_INVALID_COMBAT_STATE_ID",
    "Combat state Cing Artillery không hợp lệ"
  );
}

function assertCombatStateStatus(
  value
) {
  const status =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();

  if (
    !VALID_COMBAT_STATE_STATUSES.has(
      status
    )
  ) {
    const error =
      new Error(
        "Trạng thái combat Cing Artillery không hợp lệ"
      );

    error.code =
      "CING_ARTILLERY_INVALID_COMBAT_STATE_STATUS";

    error.statusCode =
      500;

    throw error;
  }

  return status;
}

function normalizeCombatStateRecord(
  row
) {
  if (!row) {
    return null;
  }

  return {
    id:
      assertCombatStateId(
        row.id
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
      row.player_one_account_id,

    player_one_session_id:
      row.player_one_session_id,

    player_two_account_id:
      row.player_two_account_id,

    player_two_session_id:
      row.player_two_session_id,

    status:
      assertCombatStateStatus(
        row.status
      ),

    ...(() => {
      const rulesSnapshot =
        normalizeGameRules(
          row.rules_snapshot
        );

      const rulesVersion =
        assertRulesVersionMatches({
          rulesVersion:
            row.rules_version,
          rules:
            rulesSnapshot,
        });

      return {
        rules_version:
          rulesVersion,

        rules_snapshot:
          rulesSnapshot,
      };
    })(),

    initialized_at:
      row.initialized_at,

    created_at:
      row.created_at,

    updated_at:
      row.updated_at,
  };
}

module.exports = {
  CING_ARTILLERY_COMBAT_STATE_STATUS,
  assertMatchRuntimeId,
  assertCombatStateId,
  assertCombatStateStatus,
  normalizeCombatStateRecord,
};
