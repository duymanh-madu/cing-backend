const runtimeProfileService =
  require(
    "./cingArtilleryRuntimeProfileService"
  );

const {
  normalizeGameEntryDecision,
} = require(
  "../domain/cingArtilleryGameEntryContracts"
);

async function getGameEntryDecision(
  rawUserId
) {
  /*
   * Private read-only application boundary.
   *
   * This service decides what the caller may do next.
   *
   * It must never:
   *   create an account
   *   create or mutate a character
   *   grant inventory
   *   alter loadout
   *   create a gameplay session
   *   enqueue matchmaking
   *   join a realtime room
   *
   * Runtime profile remains the canonical source of
   * account/character readiness.
   */
  const profile =
    await runtimeProfileService
      .getRuntimeProfile(
        rawUserId
      );

  return normalizeGameEntryDecision(
    profile
  );
}

module.exports = {
  getGameEntryDecision,
};
