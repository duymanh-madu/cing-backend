const constants =
  require(
    "./domain/cingArtilleryConstants"
  );

const contracts =
  require(
    "./domain/cingArtilleryContracts"
  );

const accountService =
  require(
    "./services/cingArtilleryAccountService"
  );

const featureGateService =
  require(
    "./services/cingArtilleryFeatureGateService"
  );

const characterLoadoutService =
  require(
    "./services/cingArtilleryCharacterLoadoutService"
  );

module.exports = {
  constants,
  contracts,
  accountService,
  featureGateService,
  characterLoadoutService,
};
