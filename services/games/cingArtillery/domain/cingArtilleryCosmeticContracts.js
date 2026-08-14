const {
  CING_ARTILLERY_ITEM_TYPE,
  CING_ARTILLERY_EQUIPPABLE_ITEM_TYPES,
} = require(
  "./cingArtilleryCosmeticConstants"
);

const VALID_ITEM_TYPES =
  new Set(
    Object.values(
      CING_ARTILLERY_ITEM_TYPE
    )
  );

const EQUIPPABLE_ITEM_TYPES =
  new Set(
    CING_ARTILLERY_EQUIPPABLE_ITEM_TYPES
  );

function normalizeItemKey(
  value
) {
  return String(
    value || ""
  ).trim();
}

function assertItemKey(
  value
) {
  const itemKey =
    normalizeItemKey(
      value
    );

  if (!itemKey) {
    const error =
      new Error(
        "Thiếu item_key cho Cing Artillery"
      );

    error.code =
      "CING_ARTILLERY_ITEM_KEY_REQUIRED";

    error.statusCode =
      400;

    throw error;
  }

  return itemKey;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeInventoryItemId(
  value
) {
  return String(
    value || ""
  ).trim();
}

function assertInventoryItemId(
  value
) {
  const itemId =
    normalizeInventoryItemId(
      value
    );

  if (!itemId) {
    const error =
      new Error(
        "Thiếu inventory_item_id cho Cing Artillery"
      );

    error.code =
      "CING_ARTILLERY_INVENTORY_ITEM_ID_REQUIRED";

    error.statusCode =
      400;

    throw error;
  }

  if (
    !UUID_PATTERN.test(
      itemId
    )
  ) {
    const error =
      new Error(
        "inventory_item_id Cing Artillery không hợp lệ"
      );

    error.code =
      "CING_ARTILLERY_INVALID_INVENTORY_ITEM_ID";

    error.statusCode =
      400;

    throw error;
  }

  return itemId.toLowerCase();
}

function assertItemType(
  value
) {
  const itemType =
    String(
      value || ""
    ).trim();

  if (
    !VALID_ITEM_TYPES.has(
      itemType
    )
  ) {
    const error =
      new Error(
        `Loại vật phẩm Cing Artillery không hợp lệ: ${itemType}`
      );

    error.code =
      "CING_ARTILLERY_INVALID_ITEM_TYPE";

    error.statusCode =
      400;

    throw error;
  }

  return itemType;
}

function assertEquippableItemType(
  value
) {
  const itemType =
    assertItemType(
      value
    );

  if (
    !EQUIPPABLE_ITEM_TYPES.has(
      itemType
    )
  ) {
    const error =
      new Error(
        `Vật phẩm Cing Artillery không thể trang bị: ${itemType}`
      );

    error.code =
      "CING_ARTILLERY_ITEM_NOT_EQUIPPABLE";

    error.statusCode =
      400;

    throw error;
  }

  return itemType;
}

module.exports = {
  normalizeItemKey,
  assertItemKey,
  normalizeInventoryItemId,
  assertInventoryItemId,
  assertItemType,
  assertEquippableItemType,
};
