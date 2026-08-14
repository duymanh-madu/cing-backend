const {
  CING_ARTILLERY_RUNTIME_PROFILE_STATE,
} = require(
  "./cingArtilleryRuntimeProfileContracts"
);

const CING_ARTILLERY_GAME_ENTRY_STATE =
  Object.freeze({
    ONBOARDING_REQUIRED:
      "onboarding_required",

    ACCOUNT_INACTIVE:
      "account_inactive",

    READY:
      "ready",
  });

function assertRuntimeProfile(
  profile
) {
  if (
    !profile ||
    typeof profile !== "object" ||
    Array.isArray(profile) ||
    typeof profile.user_id !== "string" ||
    profile.user_id.trim() === "" ||
    typeof profile.state !== "string"
  ) {
    const error =
      new Error(
        "Runtime profile Cing Artillery không hợp lệ"
      );

    error.code =
      "CING_ARTILLERY_INVALID_RUNTIME_PROFILE";

    error.statusCode =
      500;

    throw error;
  }

  return profile;
}

function resolveGameEntryState(
  rawProfile
) {
  const profile =
    assertRuntimeProfile(
      rawProfile
    );

  switch (profile.state) {
    case CING_ARTILLERY_RUNTIME_PROFILE_STATE
      .NOT_ONBOARDED:

    case CING_ARTILLERY_RUNTIME_PROFILE_STATE
      .IDENTITY_REQUIRED:
      return CING_ARTILLERY_GAME_ENTRY_STATE
        .ONBOARDING_REQUIRED;

    case CING_ARTILLERY_RUNTIME_PROFILE_STATE
      .ACCOUNT_INACTIVE:
      return CING_ARTILLERY_GAME_ENTRY_STATE
        .ACCOUNT_INACTIVE;

    case CING_ARTILLERY_RUNTIME_PROFILE_STATE
      .READY:
      if (
        profile.ready !== true ||
        !profile.account ||
        !profile.character
      ) {
        const error =
          new Error(
            "Trạng thái runtime Cing Artillery không nhất quán"
          );

        error.code =
          "CING_ARTILLERY_RUNTIME_STATE_INCONSISTENT";

        error.statusCode =
          500;

        throw error;
      }

      return CING_ARTILLERY_GAME_ENTRY_STATE
        .READY;

    default: {
      const error =
        new Error(
          "Trạng thái runtime Cing Artillery không được hỗ trợ"
        );

      error.code =
        "CING_ARTILLERY_UNSUPPORTED_RUNTIME_STATE";

      error.statusCode =
        500;

      throw error;
    }
  }
}

function normalizeGameEntryDecision(
  rawProfile
) {
  const profile =
    assertRuntimeProfile(
      rawProfile
    );

  const state =
    resolveGameEntryState(
      profile
    );

  return {
    user_id:
      profile.user_id,

    state,

    ready:
      state ===
      CING_ARTILLERY_GAME_ENTRY_STATE
        .READY,

    onboarding_required:
      state ===
      CING_ARTILLERY_GAME_ENTRY_STATE
        .ONBOARDING_REQUIRED,

    account_inactive:
      state ===
      CING_ARTILLERY_GAME_ENTRY_STATE
        .ACCOUNT_INACTIVE,

    profile,
  };
}

module.exports = {
  CING_ARTILLERY_GAME_ENTRY_STATE,
  assertRuntimeProfile,
  resolveGameEntryState,
  normalizeGameEntryDecision,
};
