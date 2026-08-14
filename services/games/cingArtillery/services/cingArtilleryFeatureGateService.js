const {
  isFeatureEnabled,
} = require(
  "../../../infrastructure/featureFlags/featureFlagManager"
);

const {
  CING_ARTILLERY_FEATURE_FLAG,
} = require(
  "../domain/cingArtilleryConstants"
);

async function isCingArtilleryEnabled() {
  return isFeatureEnabled(
    CING_ARTILLERY_FEATURE_FLAG
  );
}

async function requireCingArtilleryEnabled() {
  const enabled =
    await isCingArtilleryEnabled();

  if (!enabled) {
    const error =
      new Error(
        "Cing Artillery hiện chưa được mở"
      );

    error.code =
      "CING_ARTILLERY_DISABLED";

    error.statusCode =
      503;

    throw error;
  }

  return true;
}

module.exports = {
  isCingArtilleryEnabled,
  requireCingArtilleryEnabled,
};
