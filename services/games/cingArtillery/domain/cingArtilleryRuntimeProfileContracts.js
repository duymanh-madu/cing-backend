const {
  CING_ARTILLERY_ACCOUNT_STATUS,
} = require(
  "./cingArtilleryConstants"
);

const {
  assertUserId,
  normalizeAccountRecord,
} = require(
  "./cingArtilleryContracts"
);

const CING_ARTILLERY_RUNTIME_PROFILE_STATE =
  Object.freeze({
    NOT_ONBOARDED:
      "not_onboarded",

    IDENTITY_REQUIRED:
      "identity_required",

    ACCOUNT_INACTIVE:
      "account_inactive",

    READY:
      "ready",
  });

function normalizeCharacterRecord(
  row
) {
  if (!row) {
    return null;
  }

  return {
    account_id:
      row.account_id,

    character_key:
      row.character_key,

    character_name:
      row.character_name,

    gender:
      row.gender,

    created_at:
      row.created_at,

    updated_at:
      row.updated_at,
  };
}

function hasCompleteCharacterIdentity(
  character
) {
  return Boolean(
    character &&
    character.character_name &&
    character.gender
  );
}

function resolveRuntimeProfileState({
  account,
  character,
}) {
  if (!account) {
    return CING_ARTILLERY_RUNTIME_PROFILE_STATE
      .NOT_ONBOARDED;
  }

  if (
    account.status !==
    CING_ARTILLERY_ACCOUNT_STATUS.ACTIVE
  ) {
    return CING_ARTILLERY_RUNTIME_PROFILE_STATE
      .ACCOUNT_INACTIVE;
  }

  if (
    !hasCompleteCharacterIdentity(
      character
    )
  ) {
    return CING_ARTILLERY_RUNTIME_PROFILE_STATE
      .IDENTITY_REQUIRED;
  }

  return CING_ARTILLERY_RUNTIME_PROFILE_STATE
    .READY;
}

function normalizeRuntimeProfile({
  userId,
  account,
  character,
  inventory,
  loadout,
}) {
  const normalizedUserId =
    assertUserId(
      userId
    );

  const normalizedAccount =
    normalizeAccountRecord(
      account
    );

  const normalizedCharacter =
    normalizeCharacterRecord(
      character
    );

  const profileState =
    resolveRuntimeProfileState({
      account:
        normalizedAccount,

      character:
        normalizedCharacter,
    });

  const accountActive =
    normalizedAccount?.status ===
    CING_ARTILLERY_ACCOUNT_STATUS.ACTIVE;

  return {
    user_id:
      normalizedUserId,

    state:
      profileState,

    ready:
      accountActive &&
      profileState ===
        CING_ARTILLERY_RUNTIME_PROFILE_STATE
          .READY,

    onboarding_required:
      profileState ===
        CING_ARTILLERY_RUNTIME_PROFILE_STATE
          .NOT_ONBOARDED ||
      profileState ===
        CING_ARTILLERY_RUNTIME_PROFILE_STATE
          .IDENTITY_REQUIRED,

    account:
      normalizedAccount,

    character:
      normalizedCharacter,

    inventory:
      Array.isArray(
        inventory
      )
        ? inventory
        : [],

    loadout:
      Array.isArray(
        loadout
      )
        ? loadout
        : [],
  };
}

module.exports = {
  CING_ARTILLERY_RUNTIME_PROFILE_STATE,
  normalizeCharacterRecord,
  hasCompleteCharacterIdentity,
  resolveRuntimeProfileState,
  normalizeRuntimeProfile,
};
