const accountRepository =
  require(
    "../repositories/cingArtilleryAccountRepository"
  );

const characterRepository =
  require(
    "../repositories/cingArtilleryCharacterRepository"
  );

const cosmeticRepository =
  require(
    "../repositories/cingArtilleryCosmeticRepository"
  );

const {
  requireCingArtilleryEnabled,
} = require(
  "./cingArtilleryFeatureGateService"
);

const {
  assertUserId,
} = require(
  "../domain/cingArtilleryContracts"
);

const {
  normalizeRuntimeProfile,
} = require(
  "../domain/cingArtilleryRuntimeProfileContracts"
);

async function getRuntimeProfile(
  rawUserId
) {
  /*
   * Runtime profile is intentionally read-only.
   *
   * It must never:
   *   create an account
   *   create a character
   *   grant inventory
   *   alter loadout
   *
   * Atomic onboarding remains the only first-login
   * write boundary for the Cing Artillery domain.
   */
  await requireCingArtilleryEnabled();

  const userId =
    assertUserId(
      rawUserId
    );

  const account =
    await accountRepository
      .findByUserId(
        userId
      );

  if (!account) {
    return normalizeRuntimeProfile({
      userId,
      account:
        null,
      character:
        null,
      inventory:
        [],
      loadout:
        [],
    });
  }

  const [
    character,
    inventory,
    loadout,
  ] = await Promise.all([
    characterRepository
      .findByAccountId(
        account.id
      ),

    cosmeticRepository
      .listInventoryByAccountId(
        account.id
      ),

    cosmeticRepository
      .listLoadoutByAccountId(
        account.id
      ),
  ]);

  return normalizeRuntimeProfile({
    userId,
    account,
    character,
    inventory,
    loadout,
  });
}

module.exports = {
  getRuntimeProfile,
};
