const repository =
  require(
    "../repositories/cingArtilleryMapPublicationRepository"
  );

const {
  normalizePublicationInput,
  normalizePublishedMapRecord,
} = require(
  "../domain/cingArtilleryMapPublicationContracts"
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
      "CING_ARTILLERY_MAP_VERSION_ALREADY_EXISTS",
      409,
    ],
    [
      "CING_ARTILLERY_MAP_INVALID_KEY",
      400,
    ],
    [
      "CING_ARTILLERY_MAP_INVALID_VERSION",
      400,
    ],
    [
      "CING_ARTILLERY_MAP_DISPLAY_NAME_REQUIRED",
      400,
    ],
    [
      "CING_ARTILLERY_MAP_INVALID_DIMENSIONS",
      400,
    ],
    [
      "CING_ARTILLERY_MAP_INVALID_COLLISION_FORMAT",
      400,
    ],
    [
      "CING_ARTILLERY_MAP_INVALID_COLLISION_MASK",
      400,
    ],
    [
      "CING_ARTILLERY_MAP_COLLISION_HASH_MISMATCH",
      400,
    ],
    [
      "CING_ARTILLERY_MAP_RENDER_ASSET_REQUIRED",
      400,
    ],
    [
      "CING_ARTILLERY_MAP_INVALID_SELECTION_WEIGHT",
      400,
    ],
    [
      "CING_ARTILLERY_MAP_SPAWN_PAIRS_REQUIRED",
      400,
    ],
    [
      "CING_ARTILLERY_MAP_INVALID_SPAWN_PAIR",
      400,
    ],
    [
      "CING_ARTILLERY_MAP_INVALID_SPAWN_KEY",
      400,
    ],
    [
      "CING_ARTILLERY_MAP_DUPLICATE_SPAWN_KEY",
      400,
    ],
    [
      "CING_ARTILLERY_MAP_INVALID_SPAWN_WEIGHT",
      400,
    ],
    [
      "CING_ARTILLERY_MAP_SPAWN_SIDES_IDENTICAL",
      400,
    ],
    [
      "CING_ARTILLERY_MAP_SPAWN_NOT_ON_SURFACE",
      400,
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

async function publishMapVersion(
  rawInput
) {
  /*
   * Private map-publication boundary.
   *
   * JavaScript owns transport validation and canonical
   * RPC input shape only.
   *
   * PostgreSQL remains authoritative for collision-mask
   * structure, SHA-256 content identity, spawn surface
   * geometry, immutable map/version uniqueness, durable
   * IDs and atomic map + spawn persistence.
   *
   * Publication is intentionally independent from the
   * gameplay feature gate. Every published map is forced
   * disabled by PostgreSQL.
   */
  const input =
    normalizePublicationInput(
      rawInput || {}
    );

  try {
    const row =
      await repository
        .publishAtomic(
          input
        );

    if (!row) {
      throw buildError({
        message:
          "Không thể xác lập map publication Cing Artillery",
        code:
          "CING_ARTILLERY_MAP_PUBLICATION_RESOLUTION_FAILED",
        statusCode:
          500,
      });
    }

    return normalizePublishedMapRecord(
      row
    );
  } catch (error) {
    throw mapRepositoryError(
      error
    );
  }
}

module.exports = {
  publishMapVersion,
};
