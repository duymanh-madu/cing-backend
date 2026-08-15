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

const runtimeProfileService =
  require(
    "./services/cingArtilleryRuntimeProfileService"
  );

const gameEntryService =
  require(
    "./services/cingArtilleryGameEntryService"
  );

const gameplaySessionService =
  require(
    "./services/cingArtilleryGameplaySessionService"
  );

const matchmakingService =
  require(
    "./services/cingArtilleryMatchmakingService"
  );

const matchRuntimeService =
  require(
    "./services/cingArtilleryMatchRuntimeService"
  );

const combatStateService =
  require(
    "./services/cingArtilleryCombatStateService"
  );

module.exports = {
  constants,
  contracts,
  accountService,
  featureGateService,
  characterLoadoutService,
  runtimeProfileService,
  gameEntryService,
  gameplaySessionService,
  matchmakingService,
  matchRuntimeService,
  combatStateService,
};
