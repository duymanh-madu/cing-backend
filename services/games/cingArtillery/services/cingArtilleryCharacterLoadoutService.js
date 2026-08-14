const accountService =
  require(
    "./cingArtilleryAccountService"
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
  CING_ARTILLERY_ACCOUNT_STATUS,
} = require(
  "../domain/cingArtilleryConstants"
);

const {
  assertInventoryItemId,
  assertEquippableItemType,
} = require(
  "../domain/cingArtilleryCosmeticContracts"
);

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

    created_at:
      row.created_at,

    updated_at:
      row.updated_at,
  };
}

async function requireActiveAccount(
  rawUserId
) {
  const account =
    await accountService
      .ensureAccount(
        rawUserId
      );

  if (
    account.status !==
    CING_ARTILLERY_ACCOUNT_STATUS.ACTIVE
  ) {
    const error =
      new Error(
        "Tài khoản Cing Artillery hiện không hoạt động"
      );

    error.code =
      "CING_ARTILLERY_ACCOUNT_NOT_ACTIVE";

    error.statusCode =
      403;

    throw error;
  }

  return account;
}

async function ensureCharacter(
  rawUserId
) {
  const account =
    await requireActiveAccount(
      rawUserId
    );

  const existing =
    await characterRepository
      .findByAccountId(
        account.id
      );

  if (existing) {
    return normalizeCharacterRecord(
      existing
    );
  }

  try {
    const created =
      await characterRepository
        .createDefault({
          accountId:
            account.id,
        });

    return normalizeCharacterRecord(
      created
    );
  } catch (error) {
    /*
     * Concurrent character initialization:
     * account_id primary key is the source of truth.
     */
    if (
      error?.code ===
      "23505"
    ) {
      const character =
        await characterRepository
          .findByAccountId(
            account.id
          );

      if (character) {
        return normalizeCharacterRecord(
          character
        );
      }
    }

    throw error;
  }
}

async function getCharacterState(
  rawUserId
) {
  const account =
    await requireActiveAccount(
      rawUserId
    );

  let character =
    await characterRepository
      .findByAccountId(
        account.id
      );

  if (!character) {
    character =
      await ensureCharacter(
        rawUserId
      );
  }

  const [
    inventory,
    loadout,
  ] = await Promise.all([
    cosmeticRepository
      .listInventoryByAccountId(
        account.id
      ),

    cosmeticRepository
      .listLoadoutByAccountId(
        account.id
      ),
  ]);

  return {
    account,
    character:
      normalizeCharacterRecord(
        character
      ),
    inventory,
    loadout,
  };
}

async function equipInventoryItem({
  userId,
  inventoryItemId,
}) {
  const itemId =
    assertInventoryItemId(
      inventoryItemId
    );

  const account =
    await requireActiveAccount(
      userId
    );

  await ensureCharacter(
    userId
  );

  const inventoryItem =
    await cosmeticRepository
      .findInventoryItemByAccountIdAndId(
        account.id,
        itemId
      );

  if (!inventoryItem) {
    const error =
      new Error(
        "Không tìm thấy vật phẩm thuộc kho đồ của nhân vật"
      );

    error.code =
      "CING_ARTILLERY_INVENTORY_ITEM_NOT_FOUND";

    error.statusCode =
      404;

    throw error;
  }

  const itemType =
    assertEquippableItemType(
      inventoryItem.item_type
    );

  /*
   * PostgreSQL composite FK remains final authority:
   * inventory_item_id + account_id + item_type.
   */
  return cosmeticRepository
    .upsertLoadoutItem({
      accountId:
        account.id,

      itemType,

      inventoryItemId:
        inventoryItem.id,
    });
}

async function unequipItemType({
  userId,
  itemType:
    rawItemType,
}) {
  const itemType =
    assertEquippableItemType(
      rawItemType
    );

  const account =
    await requireActiveAccount(
      userId
    );

  await cosmeticRepository
    .deleteLoadoutItem({
      accountId:
        account.id,

      itemType,
    });

  return {
    account_id:
      account.id,

    item_type:
      itemType,

    equipped:
      false,
  };
}

module.exports = {
  ensureCharacter,
  getCharacterState,
  equipInventoryItem,
  unequipItemType,
};
