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

function assertRulesObject(
  value
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw buildError({
      message:
        "Game rules Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  return value;
}

const {
  normalizeAngleGridRulesV1,
} = require(
  "./cingArtilleryAngleGridV1"
);

const POSTGRES_INTEGER_MAX =
  2147483647;

function assertPositiveInteger(
  value,
  field
) {
  if (
    typeof value !== "number"
  ) {
    throw buildError({
      message:
        `Game rules Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  const number =
    value;

  if (
    !Number.isSafeInteger(number) ||
    number <= 0 ||
    number > POSTGRES_INTEGER_MAX
  ) {
    throw buildError({
      message:
        `Game rules Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  return number;
}

function assertPositiveNumber(
  value,
  field
) {
  if (
    typeof value !== "number"
  ) {
    throw buildError({
      message:
        `Game rules Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  const number =
    value;

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    throw buildError({
      message:
        `Game rules Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  return number;
}

function assertFiniteNumber(
  value,
  field
) {
  if (
    typeof value !== "number"
  ) {
    throw buildError({
      message:
        `Game rules Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  const number =
    value;

  if (
    !Number.isFinite(number)
  ) {
    throw buildError({
      message:
        `Game rules Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  return number;
}

function assertNonNegativeNumber(
  value,
  field
) {
  const number =
    assertFiniteNumber(
      value,
      field
    );

  if (number < 0) {
    throw buildError({
      message:
        `Game rules Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  return number;
}

function assertBoolean(
  value,
  field
) {
  if (
    typeof value !== "boolean"
  ) {
    throw buildError({
      message:
        `Game rules Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  return value;
}

function assertExactText(
  value,
  expected,
  field
) {
  if (
    typeof value !== "string" ||
    value !== expected
  ) {
    throw buildError({
      message:
        `Game rules Cing Artillery không hợp lệ: ${field}`,
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  return value;
}

const PHYSICS_RULES_V2_KEYS =
  Object.freeze([
    "version",
    "physics_version",

    "max_hp",
    "turn_duration_ms",

    "gravity",
    "wind_min",
    "wind_max",

    "angle_min_deg",
    "angle_max_deg",
    "angle_step_deg",

    "power_min",
    "power_max",
    "power_velocity_scale",

    "physics_step_ms",
    "max_flight_time_ms",
    "physics_fixed_scale",

    "projectile_radius_px",

    "player_hit_radius_px",
    "player_hit_center_offset_y_px",

    "muzzle_offset_forward_px",
    "muzzle_offset_up_px",

    "base_damage",
    "blast_radius",
    "blast_min_damage_ratio",

    "damage_formula_version",
    "damage_rounding",

    "self_damage_enabled",
  ]);

function assertExactPhysicsRulesV2Keyset(
  rules
) {
  const supplied =
    Object.keys(rules)
      .sort();

  const required =
    [...PHYSICS_RULES_V2_KEYS]
      .sort();

  if (
    supplied.length !==
      required.length ||
    supplied.some(
      (key, index) =>
        key !== required[index]
    )
  ) {
    throw buildError({
      message:
        "Game rules Cing Artillery V2 có keyset không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }
}

function normalizeGameRulesV1(
  rules
) {
  const normalized = {
    version:
      assertPositiveInteger(
        rules.version,
        "version"
      ),

    max_hp:
      assertPositiveNumber(
        rules.max_hp,
        "max_hp"
      ),

    turn_duration_ms:
      assertPositiveNumber(
        rules.turn_duration_ms,
        "turn_duration_ms"
      ),

    gravity:
      assertPositiveNumber(
        rules.gravity,
        "gravity"
      ),

    wind_min:
      assertFiniteNumber(
        rules.wind_min,
        "wind_min"
      ),

    wind_max:
      assertFiniteNumber(
        rules.wind_max,
        "wind_max"
      ),

    angle_min_deg:
      assertFiniteNumber(
        rules.angle_min_deg,
        "angle_min_deg"
      ),

    angle_max_deg:
      assertFiniteNumber(
        rules.angle_max_deg,
        "angle_max_deg"
      ),

    power_min:
      assertFiniteNumber(
        rules.power_min,
        "power_min"
      ),

    power_max:
      assertFiniteNumber(
        rules.power_max,
        "power_max"
      ),

    base_damage:
      assertPositiveNumber(
        rules.base_damage,
        "base_damage"
      ),

    blast_radius:
      assertPositiveNumber(
        rules.blast_radius,
        "blast_radius"
      ),
  };

  if (
    normalized.wind_min >
    normalized.wind_max
  ) {
    throw buildError({
      message:
        "Game rules Cing Artillery không hợp lệ: wind_min > wind_max",
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  if (
    normalized.angle_min_deg >
    normalized.angle_max_deg
  ) {
    throw buildError({
      message:
        "Game rules Cing Artillery không hợp lệ: angle_min_deg > angle_max_deg",
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  if (
    normalized.power_min >
    normalized.power_max
  ) {
    throw buildError({
      message:
        "Game rules Cing Artillery không hợp lệ: power_min > power_max",
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  return Object.freeze(
    normalized
  );
}

function normalizeGameRulesV2(
  rules
) {
  assertExactPhysicsRulesV2Keyset(
    rules
  );

  const normalized = {
    version:
      assertPositiveInteger(
        rules.version,
        "version"
      ),

    physics_version:
      assertPositiveInteger(
        rules.physics_version,
        "physics_version"
      ),

    max_hp:
      assertPositiveNumber(
        rules.max_hp,
        "max_hp"
      ),

    turn_duration_ms:
      assertPositiveInteger(
        rules.turn_duration_ms,
        "turn_duration_ms"
      ),

    gravity:
      assertPositiveNumber(
        rules.gravity,
        "gravity"
      ),

    wind_min:
      assertFiniteNumber(
        rules.wind_min,
        "wind_min"
      ),

    wind_max:
      assertFiniteNumber(
        rules.wind_max,
        "wind_max"
      ),

    angle_min_deg:
      assertFiniteNumber(
        rules.angle_min_deg,
        "angle_min_deg"
      ),

    angle_max_deg:
      assertFiniteNumber(
        rules.angle_max_deg,
        "angle_max_deg"
      ),

    angle_step_deg:
      assertPositiveNumber(
        rules.angle_step_deg,
        "angle_step_deg"
      ),

    power_min:
      assertNonNegativeNumber(
        rules.power_min,
        "power_min"
      ),

    power_max:
      assertFiniteNumber(
        rules.power_max,
        "power_max"
      ),

    power_velocity_scale:
      assertPositiveNumber(
        rules.power_velocity_scale,
        "power_velocity_scale"
      ),

    physics_step_ms:
      assertPositiveInteger(
        rules.physics_step_ms,
        "physics_step_ms"
      ),

    max_flight_time_ms:
      assertPositiveInteger(
        rules.max_flight_time_ms,
        "max_flight_time_ms"
      ),

    physics_fixed_scale:
      assertPositiveInteger(
        rules.physics_fixed_scale,
        "physics_fixed_scale"
      ),

    projectile_radius_px:
      assertPositiveNumber(
        rules.projectile_radius_px,
        "projectile_radius_px"
      ),

    player_hit_radius_px:
      assertPositiveNumber(
        rules.player_hit_radius_px,
        "player_hit_radius_px"
      ),

    player_hit_center_offset_y_px:
      assertPositiveNumber(
        rules.player_hit_center_offset_y_px,
        "player_hit_center_offset_y_px"
      ),

    muzzle_offset_forward_px:
      assertNonNegativeNumber(
        rules.muzzle_offset_forward_px,
        "muzzle_offset_forward_px"
      ),

    muzzle_offset_up_px:
      assertPositiveNumber(
        rules.muzzle_offset_up_px,
        "muzzle_offset_up_px"
      ),

    base_damage:
      assertPositiveNumber(
        rules.base_damage,
        "base_damage"
      ),

    blast_radius:
      assertPositiveNumber(
        rules.blast_radius,
        "blast_radius"
      ),

    blast_min_damage_ratio:
      assertPositiveNumber(
        rules.blast_min_damage_ratio,
        "blast_min_damage_ratio"
      ),

    damage_formula_version:
      assertPositiveInteger(
        rules.damage_formula_version,
        "damage_formula_version"
      ),

    damage_rounding:
      assertExactText(
        rules.damage_rounding,
        "floor",
        "damage_rounding"
      ),

    self_damage_enabled:
      assertBoolean(
        rules.self_damage_enabled,
        "self_damage_enabled"
      ),
  };

  if (
    normalized.version !== 2 ||
    normalized.physics_version !== 1 ||
    normalized.damage_formula_version !== 1
  ) {
    throw buildError({
      message:
        "Game rules Cing Artillery V2 có semantic version không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  if (
    normalized.self_damage_enabled !==
    false
  ) {
    throw buildError({
      message:
        "Game rules Cing Artillery V2 không hỗ trợ self damage",
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  if (
    normalized.wind_min >
    normalized.wind_max ||
    normalized.angle_min_deg >
    normalized.angle_max_deg ||
    normalized.power_min >
    normalized.power_max
  ) {
    throw buildError({
      message:
        "Game rules Cing Artillery V2 có range không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  normalizeAngleGridRulesV1({
    angleMinDeg:
      normalized.angle_min_deg,

    angleMaxDeg:
      normalized.angle_max_deg,

    angleStepDeg:
      normalized.angle_step_deg,

    physicsFixedScale:
      normalized.physics_fixed_scale,
  });

  if (
    normalized.max_flight_time_ms <=
      normalized.physics_step_ms ||
    (
      normalized.max_flight_time_ms %
      normalized.physics_step_ms
    ) !== 0
  ) {
    throw buildError({
      message:
        "Game rules Cing Artillery V2 có fixed-step timing không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  if (
    normalized.projectile_radius_px >=
    normalized.player_hit_radius_px
  ) {
    throw buildError({
      message:
        "Game rules Cing Artillery V2 có projectile/player geometry không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  if (
    normalized.blast_min_damage_ratio >
    1
  ) {
    throw buildError({
      message:
        "Game rules Cing Artillery V2 có blast_min_damage_ratio không hợp lệ",
      code:
        "CING_ARTILLERY_INVALID_GAME_RULES",
    });
  }

  return Object.freeze(
    normalized
  );
}

function normalizeGameRules(
  rawRules
) {
  const rules =
    assertRulesObject(
      rawRules
    );

  const version =
    assertPositiveInteger(
      rules.version,
      "version"
    );

  if (version === 1) {
    return normalizeGameRulesV1(
      rules
    );
  }

  if (version === 2) {
    return normalizeGameRulesV2(
      rules
    );
  }

  throw buildError({
    message:
      `Game rules Cing Artillery chưa hỗ trợ version ${version}`,
    code:
      "CING_ARTILLERY_UNSUPPORTED_GAME_RULES_VERSION",
  });
}

function assertRulesVersionMatches({
  rulesVersion,
  rules,
}) {
  const version =
    assertPositiveInteger(
      rulesVersion,
      "rules_version"
    );

  if (
    version !==
    rules.version
  ) {
    throw buildError({
      message:
        "Rules version và rules snapshot Cing Artillery không đồng nhất",
      code:
        "CING_ARTILLERY_RULES_VERSION_MISMATCH",
    });
  }

  return version;
}

module.exports = {
  normalizeGameRules,
  assertRulesVersionMatches,
};
