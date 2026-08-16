const repository =
  require(
    "../repositories/cingArtilleryCombatVitalRepository"
  );

const {
  assertCombatStateId,
} = require(
  "../domain/cingArtilleryCombatStateContracts"
);

const {
  normalizeCombatVitalRecord,
} = require(
  "../domain/cingArtilleryCombatVitalContracts"
);

function buildError({
  message,
  code,
  statusCode,
  cause,
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    statusCode;

  if (cause) {
    error.cause =
      cause;
  }

  return error;
}

function mapRepositoryError(
  error
) {
  const message =
    String(
      error?.message || ""
    );

  const mappings = [
    [
      "CING_ARTILLERY_COMBAT_STATE_NOT_FOUND",
      "Không tìm thấy combat state Cing Artillery",
      "CING_ARTILLERY_COMBAT_STATE_NOT_FOUND",
      404,
    ],
    [
      "CING_ARTILLERY_COMBAT_STATS_SNAPSHOT_INVALID",
      "Combat stats snapshot Cing Artillery không hợp lệ",
      "CING_ARTILLERY_COMBAT_STATS_SNAPSHOT_INVALID",
      500,
    ],
    [
      "CING_ARTILLERY_COMBAT_VITAL_STATE_RESOLUTION_FAILED",
      "Không thể xác lập Combat Vital state Cing Artillery",
      "CING_ARTILLERY_COMBAT_VITAL_STATE_RESOLUTION_FAILED",
      500,
    ],
    [
      "CING_ARTILLERY_COMBAT_VITAL_STATE_INCONSISTENT",
      "Combat Vital state Cing Artillery không nhất quán",
      "CING_ARTILLERY_COMBAT_VITAL_STATE_INCONSISTENT",
      500,
    ],
  ];

  const mapping =
    mappings.find(
      ([token]) =>
        message.includes(
          token
        )
    );

  if (!mapping) {
    return error;
  }

  const [
    ,
    mappedMessage,
    code,
    statusCode,
  ] = mapping;

  return buildError({
    message:
      mappedMessage,
    code,
    statusCode,
    cause:
      error,
  });
}

async function getByCombatStateId(
  rawCombatStateId
) {
  const combatStateId =
    assertCombatStateId(
      rawCombatStateId
    );

  const row =
    await repository
      .findByCombatStateId(
        combatStateId
      );

  return normalizeCombatVitalRecord(
    row
  );
}

async function getOrCreateForCombatState(
  rawCombatStateId
) {
  const combatStateId =
    assertCombatStateId(
      rawCombatStateId
    );

  try {
    const row =
      await repository
        .getOrCreateAtomic(
          combatStateId
        );

    if (!row) {
      throw buildError({
        message:
          "Không thể xác lập Combat Vital state Cing Artillery",
        code:
          "CING_ARTILLERY_COMBAT_VITAL_STATE_RESOLUTION_FAILED",
        statusCode:
          500,
      });
    }

    return normalizeCombatVitalRecord(
      row
    );
  } catch (error) {
    throw mapRepositoryError(
      error
    );
  }
}

module.exports = {
  getByCombatStateId,
  getOrCreateForCombatState,
};
