const POSTGRES_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const POSTGRES_INTEGER_MAX =
  2147483647;

const MAP_KEY_PATTERN =
  /^[a-z0-9][a-z0-9_-]{1,63}$/u;

const SHA256_PATTERN =
  /^[0-9a-f]{64}$/u;

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

function assertMapId(
  value,
  code =
    "CING_ARTILLERY_MAP_ID_INVALID",
  statusCode = 400
) {
  const normalized =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();

  if (
    !POSTGRES_UUID_PATTERN.test(
      normalized
    )
  ) {
    throw buildError({
      message:
        "Map id Cing Artillery không hợp lệ",
      code,
      statusCode,
    });
  }

  return normalized;
}

function assertEnabledState(
  value
) {
  if (
    typeof value !== "boolean"
  ) {
    throw buildError({
      message:
        "Trạng thái map Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_MAP_ENABLED_STATE_INVALID",
    });
  }

  return value;
}

function normalizeLifecycleInput({
  mapId,
  enabled,
}) {
  return {
    mapId:
      assertMapId(
        mapId
      ),

    enabled:
      assertEnabledState(
        enabled
      ),
  };
}

function assertCanonicalPositiveInteger(
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
        `Canonical map Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_MAP_RECORD",
      statusCode:
        500,
    });
  }

  return value;
}

function assertCanonicalMapKey(
  value
) {
  if (
    typeof value !== "string" ||
    !MAP_KEY_PATTERN.test(value)
  ) {
    throw buildError({
      message:
        "Canonical map key Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_MAP_RECORD",
      statusCode:
        500,
    });
  }

  return value;
}

function assertCanonicalText(
  value,
  field
) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw buildError({
      message:
        `Canonical map Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_MAP_RECORD",
      statusCode:
        500,
    });
  }

  return value.trim();
}

function assertCanonicalSha256(
  value
) {
  if (
    typeof value !== "string" ||
    !SHA256_PATTERN.test(value)
  ) {
    throw buildError({
      message:
        "Canonical collision SHA-256 Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_MAP_RECORD",
      statusCode:
        500,
    });
  }

  return value;
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
        `Canonical map Cing Artillery thiếu ${field}`,
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
        `Canonical map Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_MAP_RECORD",
      statusCode:
        500,
    });
  }

  return date.toISOString();
}

function normalizeMapLifecycleRecord(
  row,
  expectedEnabled
) {
  if (!row) {
    return null;
  }

  const id =
    assertMapId(
      row.id,
      "CING_ARTILLERY_INVALID_MAP_RECORD",
      500
    );

  if (
    row.enabled !==
      expectedEnabled
  ) {
    throw buildError({
      message:
        "Canonical map lifecycle Cing Artillery không nhất quán",
      code:
        "CING_ARTILLERY_MAP_LIFECYCLE_INCONSISTENT",
      statusCode:
        500,
    });
  }

  if (
    row.collision_format !==
      "bitmask_v1"
  ) {
    throw buildError({
      message:
        "Canonical collision format Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_MAP_RECORD",
      statusCode:
        500,
    });
  }

  return {
    id,

    map_key:
      assertCanonicalMapKey(
        row.map_key
      ),

    version:
      assertCanonicalPositiveInteger(
        row.version,
        "version"
      ),

    display_name:
      assertCanonicalText(
        row.display_name,
        "display_name"
      ),

    width_px:
      assertCanonicalPositiveInteger(
        row.width_px,
        "width_px"
      ),

    height_px:
      assertCanonicalPositiveInteger(
        row.height_px,
        "height_px"
      ),

    collision_format:
      "bitmask_v1",

    collision_mask_sha256:
      assertCanonicalSha256(
        row.collision_mask_sha256
      ),

    render_asset_key:
      assertCanonicalText(
        row.render_asset_key,
        "render_asset_key"
      ),

    enabled:
      expectedEnabled,

    selection_weight:
      assertCanonicalPositiveInteger(
        row.selection_weight,
        "selection_weight"
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
  normalizeLifecycleInput,
  normalizeMapLifecycleRecord,
};
