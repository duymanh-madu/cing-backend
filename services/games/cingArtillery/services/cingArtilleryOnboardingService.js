const onboardingRepository =
  require(
    "../repositories/cingArtilleryOnboardingRepository"
  );

const {
  requireCingArtilleryEnabled,
} = require(
  "./cingArtilleryFeatureGateService"
);

const {
  assertOnboardingRequest,
  normalizeOnboardingResult,
} = require(
  "../domain/cingArtilleryOnboardingContracts"
);

function buildError({
  message,
  code,
  statusCode,
}) {
  const error =
    new Error(
      message
    );

  error.code =
    code;

  error.statusCode =
    statusCode;

  return error;
}

function mapDatabaseError(
  error
) {
  const message =
    String(
      error?.message || ""
    );

  if (
    error?.code ===
    "23505"
  ) {
    return buildError({
      message:
        "Tên nhân vật Cing Artillery đã được sử dụng",

      code:
        "CING_ARTILLERY_CHARACTER_NAME_TAKEN",

      statusCode:
        409,
    });
  }

  if (
    message.includes(
      "cing_artillery_disabled"
    )
  ) {
    return buildError({
      message:
        "Cing Artillery hiện chưa được mở",

      code:
        "CING_ARTILLERY_DISABLED",

      statusCode:
        503,
    });
  }

  if (
    message.includes(
      "cing_artillery_account_not_active"
    )
  ) {
    return buildError({
      message:
        "Tài khoản Cing Artillery hiện không hoạt động",

      code:
        "CING_ARTILLERY_ACCOUNT_NOT_ACTIVE",

      statusCode:
        403,
    });
  }

  if (
    message.includes(
      "cing_artillery_config_invalid"
    ) ||
    message.includes(
      "cing_artillery_starter_config_invalid"
    ) ||
    message.includes(
      "cing_artillery_starter_item_key_invalid"
    ) ||
    message.includes(
      "cing_artillery_starter_item_type_invalid"
    ) ||
    message.includes(
      "cing_artillery_starter_equip_invalid"
    ) ||
    message.includes(
      "cing_artillery_home_decor_not_equippable"
    ) ||
    message.includes(
      "cing_artillery_duplicate_starter_item_key"
    )
  ) {
    return buildError({
      message:
        "Cấu hình onboarding Cing Artillery không hợp lệ",

      code:
        "CING_ARTILLERY_ONBOARDING_CONFIG_INVALID",

      statusCode:
        503,
    });
  }

  if (
    message.includes(
      "cing_artillery_starter_item_type_conflict"
    ) ||
    message.includes(
      "cing_artillery_starter_inventory_resolution_failed"
    ) ||
    message.includes(
      "cing_artillery_character_partial_identity"
    )
  ) {
    return buildError({
      message:
        "Trạng thái onboarding Cing Artillery không nhất quán",

      code:
        "CING_ARTILLERY_ONBOARDING_STATE_INCONSISTENT",

      statusCode:
        500,
    });
  }

  return error;
}

async function onboardCharacter({
  userId,
  characterName,
  gender,
}) {
  /*
   * Feature gate is checked before entering the write boundary.
   *
   * PostgreSQL also checks enabled=false/true inside the RPC,
   * so the repository cannot accidentally bypass dark mode.
   */
  await requireCingArtilleryEnabled();

  const request =
    assertOnboardingRequest({
      userId,
      characterName,
      gender,
    });

  try {
    const result =
      await onboardingRepository
        .onboardAtomic(
          request
        );

    return normalizeOnboardingResult(
      result
    );
  } catch (error) {
    throw mapDatabaseError(
      error
    );
  }
}

module.exports = {
  onboardCharacter,
};
