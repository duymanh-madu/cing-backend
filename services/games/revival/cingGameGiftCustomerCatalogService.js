"use strict";

/*
 * CING GAME CENTER V2
 * CUSTOMER GIFT CATALOG READ SERVICE
 *
 * PostgreSQL Catalog is the only source of:
 * - enabled Gift IDs
 * - name and icon
 * - price_vnd
 * - charm_award
 *
 * No legacy Gift fallback.
 * No client-supplied price.
 * No catalog seed.
 * No financial mutation.
 */

const supabase =
  require("../../../supabase");

const MAX_POINTS =
  2147483647n;

const GIFT_ID =
  /^[a-z0-9][a-z0-9_-]{0,63}$/;

function invalidCatalog() {
  const error = new Error(
    "GAME_GIFT_CATALOG_INVALID"
  );

  error.code =
    "GAME_GIFT_CATALOG_INVALID";

  error.statusCode =
    502;

  return error;
}

function catalogUnavailable() {
  const error = new Error(
    "GAME_GIFT_CATALOG_UNAVAILABLE"
  );

  error.code =
    "GAME_GIFT_CATALOG_UNAVAILABLE";

  error.statusCode =
    503;

  return error;
}

function priceOf(value) {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    throw invalidCatalog();
  }

  if (
    typeof value === "number" &&
    !Number.isSafeInteger(value)
  ) {
    throw invalidCatalog();
  }

  const raw =
    String(value);

  if (
    !/^[1-9][0-9]*$/.test(raw)
  ) {
    throw invalidCatalog();
  }

  const price =
    BigInt(raw);

  if (
    price < 1000n ||
    price % 1000n !== 0n ||
    price / 1000n > MAX_POINTS
  ) {
    throw invalidCatalog();
  }

  return price;
}

function charmOf(value) {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > 2147483647
  ) {
    throw invalidCatalog();
  }

  return value;
}

function normalizeGift(row) {
  if (
    !row ||
    typeof row !== "object" ||
    !GIFT_ID.test(row.id) ||
    typeof row.name !== "string" ||
    !row.name.trim() ||
    row.name.trim().length > 120 ||
    typeof row.icon !== "string" ||
    !row.icon.trim() ||
    row.icon.trim().length > 64 ||
    row.enabled !== true
  ) {
    throw invalidCatalog();
  }

  const price =
    priceOf(row.price_vnd);

  return {
    id:
      row.id,

    name:
      row.name,

    icon:
      row.icon,

    price_vnd:
      price.toString(),

    points_cost:
      (
        price / 1000n
      ).toString(),

    charm_award:
      charmOf(
        row.charm_award
      ),
  };
}

async function getCustomerGameGiftCatalog() {
  const {
    data,
    error,
  } = await supabase
    .from(
      "cing_game_gift_catalog"
    )
    .select(
      "id,name,icon,price_vnd,charm_award,enabled"
    )
    .eq(
      "enabled",
      true
    )
    .order(
      "id",
      {
        ascending: true,
      }
    );

  if (error) {
    throw catalogUnavailable();
  }

  if (
    !Array.isArray(data) ||
    data.length > 100
  ) {
    throw invalidCatalog();
  }

  const seen =
    new Set();

  return data.map(row => {
    const gift =
      normalizeGift(row);

    if (
      seen.has(gift.id)
    ) {
      throw invalidCatalog();
    }

    seen.add(
      gift.id
    );

    return gift;
  });
}

module.exports = {
  getCustomerGameGiftCatalog,
};
