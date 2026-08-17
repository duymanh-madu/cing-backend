const POSTGRES_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const POSTGRES_INTEGER_MAX =
  2147483647;

const CING_ARTILLERY_COMBAT_WORLD_SIDE =
  Object.freeze({
    A:
      "a",

    B:
      "b",
  });

const VALID_COMBAT_WORLD_SIDES =
  new Set(
    Object.values(
      CING_ARTILLERY_COMBAT_WORLD_SIDE
    )
  );

function buildError({
  message,
  code,
  statusCode = 500,
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    statusCode;

  return error;
}

function assertUuid(
  value,
  field
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
        `Combat world Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_COMBAT_WORLD",
    });
  }

  return normalized;
}

function assertCombatWorldId(
  value
) {
  return assertUuid(
    value,
    "id"
  );
}

function assertMapId(
  value
) {
  return assertUuid(
    value,
    "map_id"
  );
}

function assertSpawnPairId(
  value
) {
  return assertUuid(
    value,
    "spawn_pair_id"
  );
}

function assertSide(
  value,
  field
) {
  const normalized =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();

  if (
    !VALID_COMBAT_WORLD_SIDES.has(
      normalized
    )
  ) {
    throw buildError({
      message:
        `Combat world Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_COMBAT_WORLD",
    });
  }

  return normalized;
}

function assertCoordinate(
  value,
  field
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(
      value
    ) ||
    value < 0 ||
    value > POSTGRES_INTEGER_MAX
  ) {
    throw buildError({
      message:
        `Combat world Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_COMBAT_WORLD",
    });
  }

  return value;
}

function assertFiniteNumeric(
  value,
  field
) {
  const numeric =
    typeof value === "number"
      ? value
      : (
          typeof value === "string" &&
          value.trim() !== ""
            ? Number(value)
            : Number.NaN
        );

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    throw buildError({
      message:
        `Combat world Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_COMBAT_WORLD",
    });
  }

  return numeric;
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
        `Combat world Cing Artillery thiếu ${field}`,
      code:
        "CING_ARTILLERY_INVALID_COMBAT_WORLD",
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
        `Combat world Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_COMBAT_WORLD",
    });
  }

  return date.toISOString();
}

function normalizeCombatWorldRecord(
  row
) {
  if (!row) {
    return null;
  }

  const playerOneSide =
    assertSide(
      row.player_one_side,
      "player_one_side"
    );

  const playerTwoSide =
    assertSide(
      row.player_two_side,
      "player_two_side"
    );

  const oppositeSides =
    (
      playerOneSide ===
        CING_ARTILLERY_COMBAT_WORLD_SIDE.A &&
      playerTwoSide ===
        CING_ARTILLERY_COMBAT_WORLD_SIDE.B
    ) ||
    (
      playerOneSide ===
        CING_ARTILLERY_COMBAT_WORLD_SIDE.B &&
      playerTwoSide ===
        CING_ARTILLERY_COMBAT_WORLD_SIDE.A
    );

  if (!oppositeSides) {
    throw buildError({
      message:
        "Combat world Cing Artillery có side assignment không nhất quán",
      code:
        "CING_ARTILLERY_INVALID_COMBAT_WORLD",
    });
  }

  const playerOneX =
    assertCoordinate(
      row.player_one_x,
      "player_one_x"
    );

  const playerOneY =
    assertCoordinate(
      row.player_one_y,
      "player_one_y"
    );

  const playerTwoX =
    assertCoordinate(
      row.player_two_x,
      "player_two_x"
    );

  const playerTwoY =
    assertCoordinate(
      row.player_two_y,
      "player_two_y"
    );

  if (
    playerOneX === playerTwoX &&
    playerOneY === playerTwoY
  ) {
    throw buildError({
      message:
        "Combat world Cing Artillery có vị trí spawn không nhất quán",
      code:
        "CING_ARTILLERY_INVALID_COMBAT_WORLD",
    });
  }

  /*
   * Physics V1 horizontal firing direction derives from the
   * opponent X position, never from side A/B labels.
   *
   * Equal X would make that direction undefined.
   */
  if (
    playerOneX ===
    playerTwoX
  ) {
    throw buildError({
      message:
        "Combat world Cing Artillery có horizontal spawn direction không xác định",
      code:
        "CING_ARTILLERY_INVALID_COMBAT_WORLD",
    });
  }

  return {
    id:
      assertCombatWorldId(
        row.id
      ),

    combat_state_id:
      assertUuid(
        row.combat_state_id,
        "combat_state_id"
      ),

    match_runtime_id:
      assertUuid(
        row.match_runtime_id,
        "match_runtime_id"
      ),

    match_id:
      assertUuid(
        row.match_id,
        "match_id"
      ),

    map_id:
      assertMapId(
        row.map_id
      ),

    spawn_pair_id:
      assertSpawnPairId(
        row.spawn_pair_id
      ),

    player_one_side:
      playerOneSide,

    player_two_side:
      playerTwoSide,

    player_one_x:
      playerOneX,

    player_one_y:
      playerOneY,

    player_two_x:
      playerTwoX,

    player_two_y:
      playerTwoY,

    initial_wind:
      assertFiniteNumeric(
        row.initial_wind,
        "initial_wind"
      ),

    initialized_at:
      normalizeTimestamp(
        row.initialized_at,
        "initialized_at"
      ),

    created_at:
      normalizeTimestamp(
        row.created_at,
        "created_at"
      ),
  };
}

module.exports = {
  CING_ARTILLERY_COMBAT_WORLD_SIDE,
  assertCombatWorldId,
  normalizeCombatWorldRecord,
};
