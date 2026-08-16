const repository =
  require(
    "../repositories/cingArtilleryMapLifecycleRepository"
  );

const {
  normalizeLifecycleInput,
  normalizeMapLifecycleRecord,
} = require(
  "../domain/cingArtilleryMapLifecycleContracts"
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
      "CING_ARTILLERY_MAP_ID_REQUIRED",
      "CING_ARTILLERY_MAP_ID_INVALID",
      400,
    ],
    [
      "CING_ARTILLERY_MAP_ENABLED_STATE_REQUIRED",
      "CING_ARTILLERY_MAP_ENABLED_STATE_INVALID",
      400,
    ],
    [
      "CING_ARTILLERY_MAP_NOT_FOUND",
      "CING_ARTILLERY_MAP_NOT_FOUND",
      404,
    ],
    [
      "CING_ARTILLERY_MAP_ENABLE_COLLISION_INVALID",
      "CING_ARTILLERY_MAP_ENABLE_COLLISION_INVALID",
      409,
    ],
    [
      "CING_ARTILLERY_MAP_ENABLE_COLLISION_HASH_INVALID",
      "CING_ARTILLERY_MAP_ENABLE_COLLISION_HASH_INVALID",
      409,
    ],
    [
      "CING_ARTILLERY_MAP_ENABLE_SPAWN_INVALID",
      "CING_ARTILLERY_MAP_ENABLE_SPAWN_INVALID",
      409,
    ],
    [
      "CING_ARTILLERY_MAP_ENABLE_REQUIRES_SPAWN",
      "CING_ARTILLERY_MAP_ENABLE_REQUIRES_SPAWN",
      409,
    ],
    [
      "CING_ARTILLERY_MAP_ENABLE_STATE_INCONSISTENT",
      "CING_ARTILLERY_MAP_LIFECYCLE_INCONSISTENT",
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

async function setMapVersionEnabled({
  mapId,
  enabled,
}) {
  /*
   * Private map lifecycle boundary.
   *
   * JavaScript owns:
   *
   *   input shape
   *   RPC transport
   *   canonical output normalization
   *   public service error semantics
   *
   * PostgreSQL exclusively owns:
   *
   *   row locking
   *   collision/hash revalidation
   *   enabled spawn eligibility
   *   idempotent state confirmation
   *   updated_at transition authority
   *
   * This content lifecycle is deliberately independent
   * from the gameplay feature gate.
   */
  const input =
    normalizeLifecycleInput({
      mapId,
      enabled,
    });

  try {
    const row =
      await repository
        .setEnabledAtomic(
          input
        );

    if (!row) {
      throw buildError({
        message:
          "Không thể xác lập map lifecycle Cing Artillery",
        code:
          "CING_ARTILLERY_MAP_LIFECYCLE_RESOLUTION_FAILED",
        statusCode:
          500,
      });
    }

    return normalizeMapLifecycleRecord(
      row,
      input.enabled
    );
  } catch (error) {
    throw mapRepositoryError(
      error
    );
  }
}

module.exports = {
  setMapVersionEnabled,
};
