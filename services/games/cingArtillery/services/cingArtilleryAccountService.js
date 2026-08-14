const crypto =
  require(
    "crypto"
  );

const accountRepository =
  require(
    "../repositories/cingArtilleryAccountRepository"
  );

const {
  CING_ARTILLERY_ACCOUNT_STATUS,
} = require(
  "../domain/cingArtilleryConstants"
);

const {
  assertUserId,
  normalizeAccountRecord,
} = require(
  "../domain/cingArtilleryContracts"
);

const {
  requireCingArtilleryEnabled,
} = require(
  "./cingArtilleryFeatureGateService"
);

async function getAccountByUserId(
  rawUserId
) {
  const userId =
    assertUserId(
      rawUserId
    );

  const account =
    await accountRepository
      .findByUserId(
        userId
      );

  return normalizeAccountRecord(
    account
  );
}

async function ensureAccount(
  rawUserId
) {
  await requireCingArtilleryEnabled();

  const userId =
    assertUserId(
      rawUserId
    );

  const existing =
    await accountRepository
      .findByUserId(
        userId
      );

  if (existing) {
    return normalizeAccountRecord(
      existing
    );
  }

  try {
    const created =
      await accountRepository
        .create({
          id:
            crypto.randomUUID(),

          userId,

          status:
            CING_ARTILLERY_ACCOUNT_STATUS
              .ACTIVE,
        });

    return normalizeAccountRecord(
      created
    );
  } catch (error) {
    /*
     * Concurrent initialization:
     * unique(user_id) is the source of truth.
     * Re-read instead of producing duplicate accounts.
     */
    if (
      error?.code ===
      "23505"
    ) {
      const account =
        await accountRepository
          .findByUserId(
            userId
          );

      if (account) {
        return normalizeAccountRecord(
          account
        );
      }
    }

    throw error;
  }
}

module.exports = {
  getAccountByUserId,
  ensureAccount,
};
