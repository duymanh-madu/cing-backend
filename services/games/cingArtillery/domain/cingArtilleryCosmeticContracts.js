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
  assertItemType,
  assertEquippableItemType,
};
