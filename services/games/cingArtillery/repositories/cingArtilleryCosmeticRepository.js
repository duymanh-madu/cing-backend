const supabase =
  require(
    "../../../../supabase"
  );

const INVENTORY_TABLE =
  "cing_artillery_inventory";

const LOADOUT_TABLE =
  "cing_artillery_loadouts";

const INVENTORY_FIELDS =
  [
    "id",
    "account_id",
    "item_key",
    "item_type",
    "acquired_at",
  ].join(",");

const LOADOUT_FIELDS =
  [
    "account_id",
    "item_type",
    "inventory_item_id",
    "updated_at",
  ].join(",");

async function listInventoryByAccountId(
  accountId
) {
  const {
    data,
    error,
  } = await supabase
    .from(
      INVENTORY_TABLE
    )
    .select(
      INVENTORY_FIELDS
    )
    .eq(
      "account_id",
      accountId
    )
    .order(
      "acquired_at",
      {
        ascending: true,
      }
    );

  if (error) {
    throw error;
  }

  return data || [];
}

async function findInventoryItemByAccountIdAndId(
  accountId,
  itemId
) {
  const {
    data,
    error,
  } = await supabase
    .from(
      INVENTORY_TABLE
    )
    .select(
      INVENTORY_FIELDS
    )
    .eq(
      "account_id",
      accountId
    )
    .eq(
      "id",
      itemId
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function listLoadoutByAccountId(
  accountId
) {
  const {
    data,
    error,
  } = await supabase
    .from(
      LOADOUT_TABLE
    )
    .select(
      LOADOUT_FIELDS
    )
    .eq(
      "account_id",
      accountId
    )
    .order(
      "item_type",
      {
        ascending: true,
      }
    );

  if (error) {
    throw error;
  }

  return data || [];
}

module.exports = {
  listInventoryByAccountId,
  findInventoryItemByAccountIdAndId,
  listLoadoutByAccountId,
};
