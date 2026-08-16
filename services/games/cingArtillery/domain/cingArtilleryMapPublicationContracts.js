const POSTGRES_INTEGER_MAX =
  2147483647;

const MAP_KEY_PATTERN =
  /^[a-z0-9][a-z0-9_-]{1,63}$/u;

const SHA256_PATTERN =
  /^[0-9a-f]{64}$/u;

const COLLISION_FORMAT =
  "bitmask_v1";

const SPAWN_KEYS =
  new Set([
    "spawn_key",
    "side_a_x",
    "side_a_y",
    "side_b_x",
    "side_b_y",
    "enabled",
    "selection_weight",
  ]);

const REQUIRED_SPAWN_KEYS = [
  "spawn_key",
  "side_a_x",
  "side_a_y",
  "side_b_x",
  "side_b_y",
];

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

function assertNonEmptyText(
  value,
  field,
  code,
  statusCode = 400
) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw buildError({
      message:
        `Map publication Cing Artillery không hợp lệ: ${field}`,
      code,
      statusCode,
    });
  }

  return value.trim();
}

function assertMapKey(
  value,
  code =
    "CING_ARTILLERY_MAP_INVALID_KEY",
  statusCode = 400
) {
  if (
    typeof value !== "string" ||
    !MAP_KEY_PATTERN.test(value)
  ) {
    throw buildError({
      message:
        "Map key Cing Artillery không hợp lệ",
      code,
      statusCode,
    });
  }

  return value;
}

function assertSpawnKey(
  value
) {
  return assertMapKey(
    value,
    "CING_ARTILLERY_MAP_INVALID_SPAWN_KEY"
  );
}

function assertPositiveInteger(
  value,
  field,
  code,
  statusCode = 400
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > POSTGRES_INTEGER_MAX
  ) {
    throw buildError({
      message:
        `Map publication Cing Artillery không hợp lệ: ${field}`,
      code,
      statusCode,
    });
  }

  return value;
}

function assertNonNegativeInteger(
  value,
  field
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > POSTGRES_INTEGER_MAX
  ) {
    throw buildError({
      message:
        `Spawn pair Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_MAP_INVALID_SPAWN_PAIR",
    });
  }

  return value;
}

function assertCollisionFormat(
  value,
  code =
    "CING_ARTILLERY_MAP_INVALID_COLLISION_FORMAT",
  statusCode = 400
) {
  if (
    value !== COLLISION_FORMAT
  ) {
    throw buildError({
      message:
        "Collision format Cing Artillery không hợp lệ",
      code,
      statusCode,
    });
  }

  return value;
}

function assertCollisionMask(
  value
) {
  if (
    !Buffer.isBuffer(value) ||
    value.length === 0
  ) {
    throw buildError({
      message:
        "Collision mask Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_MAP_INVALID_COLLISION_MASK",
    });
  }

  return value;
}

function assertCollisionMaskSha256(
  value,
  code =
    "CING_ARTILLERY_MAP_INVALID_COLLISION_HASH",
  statusCode = 400
) {
  if (
    typeof value !== "string" ||
    !SHA256_PATTERN.test(value)
  ) {
    throw buildError({
      message:
        "Collision mask SHA-256 Cing Artillery không hợp lệ",
      code,
      statusCode,
    });
  }

  return value;
}

function normalizeSpawnPair(
  value
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw buildError({
      message:
        "Spawn pair Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_MAP_INVALID_SPAWN_PAIR",
    });
  }

  const keys =
    Object.keys(value);

  if (
    REQUIRED_SPAWN_KEYS.some(
      (key) =>
        !Object.prototype.hasOwnProperty.call(
          value,
          key
        )
    ) ||
    keys.some(
      (key) =>
        !SPAWN_KEYS.has(key)
    )
  ) {
    throw buildError({
      message:
        "Spawn pair Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_MAP_INVALID_SPAWN_PAIR",
    });
  }

  const spawnKey =
    assertSpawnKey(
      value.spawn_key
    );

  const sideAX =
    assertNonNegativeInteger(
      value.side_a_x,
      "side_a_x"
    );

  const sideAY =
    assertNonNegativeInteger(
      value.side_a_y,
      "side_a_y"
    );

  const sideBX =
    assertNonNegativeInteger(
      value.side_b_x,
      "side_b_x"
    );

  const sideBY =
    assertNonNegativeInteger(
      value.side_b_y,
      "side_b_y"
    );

  if (
    sideAX === sideBX &&
    sideAY === sideBY
  ) {
    throw buildError({
      message:
        "Hai phía spawn Cing Artillery không được trùng nhau",
      code:
        "CING_ARTILLERY_MAP_SPAWN_SIDES_IDENTICAL",
    });
  }

  if (
    value.enabled !== undefined &&
    typeof value.enabled !== "boolean"
  ) {
    throw buildError({
      message:
        "Spawn pair Cing Artillery không hợp lệ: enabled",
      code:
        "CING_ARTILLERY_MAP_INVALID_SPAWN_PAIR",
    });
  }

  const selectionWeight =
    value.selection_weight === undefined
      ? 1
      : assertPositiveInteger(
          value.selection_weight,
          "selection_weight",
          "CING_ARTILLERY_MAP_INVALID_SPAWN_WEIGHT"
        );

  return {
    spawn_key:
      spawnKey,

    side_a_x:
      sideAX,

    side_a_y:
      sideAY,

    side_b_x:
      sideBX,

    side_b_y:
      sideBY,

    enabled:
      value.enabled === undefined
        ? true
        : value.enabled,

    selection_weight:
      selectionWeight,
  };
}

function normalizeSpawnPairs(
  value
) {
  if (
    !Array.isArray(value) ||
    value.length === 0
  ) {
    throw buildError({
      message:
        "Map Cing Artillery phải có spawn pair",
      code:
        "CING_ARTILLERY_MAP_SPAWN_PAIRS_REQUIRED",
    });
  }

  const normalized =
    value.map(
      normalizeSpawnPair
    );

  const seen =
    new Set();

  for (
    const spawn of normalized
  ) {
    if (
      seen.has(
        spawn.spawn_key
      )
    ) {
      throw buildError({
        message:
          "Spawn key Cing Artillery bị trùng",
        code:
          "CING_ARTILLERY_MAP_DUPLICATE_SPAWN_KEY",
      });
    }

    seen.add(
      spawn.spawn_key
    );
  }

  return normalized;
}

function normalizePublicationInput({
  mapKey,
  version,
  displayName,
  widthPx,
  heightPx,
  collisionFormat,
  collisionMask,
  collisionMaskSha256,
  renderAssetKey,
  selectionWeight = 1,
  spawnPairs,
}) {
  return {
    mapKey:
      assertMapKey(
        mapKey
      ),

    version:
      assertPositiveInteger(
        version,
        "version",
        "CING_ARTILLERY_MAP_INVALID_VERSION"
      ),

    displayName:
      assertNonEmptyText(
        displayName,
        "display_name",
        "CING_ARTILLERY_MAP_DISPLAY_NAME_REQUIRED"
      ),

    widthPx:
      assertPositiveInteger(
        widthPx,
        "width_px",
        "CING_ARTILLERY_MAP_INVALID_DIMENSIONS"
      ),

    heightPx:
      assertPositiveInteger(
        heightPx,
        "height_px",
        "CING_ARTILLERY_MAP_INVALID_DIMENSIONS"
      ),

    collisionFormat:
      assertCollisionFormat(
        collisionFormat
      ),

    collisionMask:
      assertCollisionMask(
        collisionMask
      ),

    collisionMaskSha256:
      assertCollisionMaskSha256(
        collisionMaskSha256
      ),

    renderAssetKey:
      assertNonEmptyText(
        renderAssetKey,
        "render_asset_key",
        "CING_ARTILLERY_MAP_RENDER_ASSET_REQUIRED"
      ),

    selectionWeight:
      assertPositiveInteger(
        selectionWeight,
        "selection_weight",
        "CING_ARTILLERY_MAP_INVALID_SELECTION_WEIGHT"
      ),

    spawnPairs:
      normalizeSpawnPairs(
        spawnPairs
      ),
  };
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
        `Published map Cing Artillery thiếu ${field}`,
      code:
        "CING_ARTILLERY_INVALID_MAP_RECORD",
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
        `Published map Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_MAP_RECORD",
      statusCode:
        500,
    });
  }

  return date.toISOString();
}

function normalizePublishedMapRecord(
  row
) {
  if (!row) {
    return null;
  }

  const id =
    String(
      row.id || ""
    )
      .trim()
      .toLowerCase();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
      .test(id)
  ) {
    throw buildError({
      message:
        "Published map Cing Artillery có id không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_MAP_RECORD",
      statusCode:
        500,
    });
  }

  if (
    row.enabled !== false
  ) {
    throw buildError({
      message:
        "Published map Cing Artillery vi phạm disabled-by-default invariant",
      code:
        "CING_ARTILLERY_MAP_PUBLICATION_INCONSISTENT",
      statusCode:
        500,
    });
  }

  return {
    id,

    map_key:
      assertMapKey(
        row.map_key,
        "CING_ARTILLERY_INVALID_MAP_RECORD",
        500
      ),

    version:
      assertPositiveInteger(
        row.version,
        "version",
        "CING_ARTILLERY_INVALID_MAP_RECORD",
        500
      ),

    display_name:
      assertNonEmptyText(
        row.display_name,
        "display_name",
        "CING_ARTILLERY_INVALID_MAP_RECORD",
        500
      ),

    width_px:
      assertPositiveInteger(
        row.width_px,
        "width_px",
        "CING_ARTILLERY_INVALID_MAP_RECORD",
        500
      ),

    height_px:
      assertPositiveInteger(
        row.height_px,
        "height_px",
        "CING_ARTILLERY_INVALID_MAP_RECORD",
        500
      ),

    collision_format:
      assertCollisionFormat(
        row.collision_format,
        "CING_ARTILLERY_INVALID_MAP_RECORD",
        500
      ),

    collision_mask_sha256:
      assertCollisionMaskSha256(
        row.collision_mask_sha256,
        "CING_ARTILLERY_INVALID_MAP_RECORD",
        500
      ),

    render_asset_key:
      assertNonEmptyText(
        row.render_asset_key,
        "render_asset_key",
        "CING_ARTILLERY_INVALID_MAP_RECORD",
        500
      ),

    enabled:
      false,

    selection_weight:
      assertPositiveInteger(
        row.selection_weight,
        "selection_weight",
        "CING_ARTILLERY_INVALID_MAP_RECORD",
        500
      ),

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
  COLLISION_FORMAT,
  normalizePublicationInput,
  normalizePublishedMapRecord,
};
