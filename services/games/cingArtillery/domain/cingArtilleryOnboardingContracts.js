const {
  assertUserId,
} = require(
  "./cingArtilleryContracts"
);

const {
  assertCharacterName,
  assertGender,
} = require(
  "./cingArtilleryCharacterIdentityContracts"
);

function assertOnboardingRequest({
  userId,
  characterName,
  gender,
}) {
  return {
    userId:
      assertUserId(
        userId
      ),

    characterName:
      assertCharacterName(
        characterName
      ),

    gender:
      assertGender(
        gender
      ),
  };
}

function normalizeNonNegativeInteger(
  value
) {
  const numeric =
    Number(
      value
    );

  if (
    !Number.isInteger(
      numeric
    ) ||
    numeric < 0
  ) {
    return 0;
  }

  return numeric;
}

function normalizeOnboardingResult(
  row
) {
  if (
    !row ||
    !row.account_id
  ) {
    const error =
      new Error(
        "Kết quả onboarding Cing Artillery không hợp lệ"
      );

    error.code =
      "CING_ARTILLERY_INVALID_ONBOARDING_RESULT";

    error.statusCode =
      500;

    throw error;
  }

  return {
    account_id:
      row.account_id,

    account_status:
      row.account_status,

    character_key:
      row.character_key,

    character_name:
      row.character_name,

    gender:
      row.gender,

    character_created:
      row.character_created ===
      true,

    starter_inventory_granted:
      normalizeNonNegativeInteger(
        row.starter_inventory_granted
      ),

    starter_loadout_equipped:
      normalizeNonNegativeInteger(
        row.starter_loadout_equipped
      ),
  };
}

module.exports = {
  assertOnboardingRequest,
  normalizeOnboardingResult,
};
