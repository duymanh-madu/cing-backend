const repository =
  require(
    "../repositories/cingArtilleryCombatWorldRepository"
  );

const {
  assertCombatStateId,
} = require(
  "../domain/cingArtilleryCombatStateContracts"
);

const {
  normalizeCombatWorldRecord,
} = require(
  "../domain/cingArtilleryCombatWorldContracts"
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
      "CING_ARTILLERY_COMBAT_STATE_ID_REQUIRED",
      "CING_ARTILLERY_INVALID_COMBAT_STATE_ID",
      400,
    ],
    [
      "cing_artillery_disabled",
      "CING_ARTILLERY_DISABLED",
      503,
    ],
    [
      "cing_artillery_config_invalid",
      "CING_ARTILLERY_CONFIG_INVALID",
      500,
    ],
    [
      "CING_ARTILLERY_COMBAT_STATE_NOT_FOUND",
      "CING_ARTILLERY_COMBAT_STATE_NOT_FOUND",
      404,
    ],
    [
      "CING_ARTILLERY_COMBAT_STATE_NOT_WORLD_ELIGIBLE",
      "CING_ARTILLERY_COMBAT_STATE_NOT_WORLD_ELIGIBLE",
      409,
    ],
    [
      "CING_ARTILLERY_COMBAT_WORLD_RULES_INVALID",
      "CING_ARTILLERY_COMBAT_WORLD_RULES_INVALID",
      500,
    ],
    [
      "CING_ARTILLERY_COMBAT_WORLD_INCONSISTENT",
      "CING_ARTILLERY_COMBAT_WORLD_INCONSISTENT",
      500,
    ],
    [
      "CING_ARTILLERY_COMBAT_WORLD_MAP_MISSING",
      "CING_ARTILLERY_COMBAT_WORLD_MAP_MISSING",
      500,
    ],
    [
      "CING_ARTILLERY_COMBAT_WORLD_SPAWN_INCONSISTENT",
      "CING_ARTILLERY_COMBAT_WORLD_SPAWN_INCONSISTENT",
      500,
    ],
    [
      "CING_ARTILLERY_COMBAT_WORLD_MAP_INCONSISTENT",
      "CING_ARTILLERY_COMBAT_WORLD_MAP_INCONSISTENT",
      500,
    ],
    [
      "CING_ARTILLERY_COMBAT_WORLD_NO_ENABLED_MAP",
      "CING_ARTILLERY_COMBAT_WORLD_NO_ENABLED_MAP",
      409,
    ],
    [
      "CING_ARTILLERY_COMBAT_WORLD_MAP_INVALID",
      "CING_ARTILLERY_COMBAT_WORLD_MAP_INVALID",
      500,
    ],
    [
      "CING_ARTILLERY_COMBAT_WORLD_NO_ENABLED_SPAWN",
      "CING_ARTILLERY_COMBAT_WORLD_NO_ENABLED_SPAWN",
      409,
    ],
    [
      "CING_ARTILLERY_COMBAT_WORLD_SPAWN_INVALID",
      "CING_ARTILLERY_COMBAT_WORLD_SPAWN_INVALID",
      500,
    ],
    [
      "CING_ARTILLERY_COMBAT_WORLD_WIND_INVALID",
      "CING_ARTILLERY_COMBAT_WORLD_WIND_INVALID",
      500,
    ],
    [
      "CING_ARTILLERY_COMBAT_WORLD_PERSISTENCE_INCONSISTENT",
      "CING_ARTILLERY_COMBAT_WORLD_PERSISTENCE_INCONSISTENT",
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
    code,
    statusCode,
  ] = mapping;

  return buildError({
    message:
      code,
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

  return normalizeCombatWorldRecord(
    row
  );
}

async function getOrCreateForCombatState(
  rawCombatStateId
) {
  /*
   * Private combat-world boundary.
   *
   * JavaScript owns:
   *
   *   combat_state_id input validation
   *   RPC transport
   *   canonical output normalization
   *   service error semantics
   *
   * PostgreSQL exclusively owns:
   *
   *   feature-gate enforcement for new world creation
   *   canonical combat serialization
   *   weighted map selection
   *   weighted spawn selection
   *   collision/hash/surface validation
   *   A/B side assignment
   *   resolved spawn coordinates
   *   initial wind generation
   *   immutable world persistence
   *   idempotent re-entry
   *
   * No caller-supplied map, spawn, side, coordinate or wind
   * value is accepted by this boundary.
   */
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
          "Không thể xác lập combat world Cing Artillery",
        code:
          "CING_ARTILLERY_COMBAT_WORLD_RESOLUTION_FAILED",
        statusCode:
          500,
      });
    }

    const world =
      normalizeCombatWorldRecord(
        row
      );

    if (
      !world ||
      world.combat_state_id !==
        combatStateId
    ) {
      throw buildError({
        message:
          "Combat world Cing Artillery không nhất quán với combat authority",
        code:
          "CING_ARTILLERY_COMBAT_WORLD_INCONSISTENT",
        statusCode:
          500,
      });
    }

    return world;
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
