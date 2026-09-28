"use strict";

const supabase =
  require("../../../supabase");

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const GIFT_ID =
  /^[a-z0-9][a-z0-9_-]{0,63}$/;

const MAX_POINTS =
  2147483647n;

function failure(
  code,
  statusCode
) {
  const error =
    new Error(code);

  error.code =
    code;

  error.statusCode =
    statusCode;

  return error;
}

function priceOf(value) {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    throw failure(
      "GAME_GIFT_ADMIN_PRICE_INVALID",
      400
    );
  }

  if (
    typeof value === "number" &&
    !Number.isSafeInteger(value)
  ) {
    throw failure(
      "GAME_GIFT_ADMIN_PRICE_INVALID",
      400
    );
  }

  const text =
    String(value);

  if (
    !/^[1-9][0-9]*$/.test(text)
  ) {
    throw failure(
      "GAME_GIFT_ADMIN_PRICE_INVALID",
      400
    );
  }

  const valueBig =
    BigInt(text);

  if (
    valueBig < 1000n ||
    valueBig % 1000n !== 0n ||
    valueBig / 1000n >
      MAX_POINTS
  ) {
    throw failure(
      "GAME_GIFT_ADMIN_PRICE_INVALID",
      400
    );
  }

  return valueBig.toString();
}

function charmOf(value) {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > 2147483647
  ) {
    throw failure(
      "GAME_GIFT_ADMIN_CHARM_INVALID",
      400
    );
  }

  return value;
}

function textOf(
  value,
  max
) {
  const result =
    typeof value === "string"
      ? value.trim()
      : "";

  return (
    result &&
    result.length <= max
  )
    ? result
    : "";
}

async function upsertGameGiftCatalog({
  actorId,
  requestId,
  giftId,
  name,
  icon,
  priceVnd,
  charmAward,
  enabled,
}) {
  const actor =
    textOf(
      actorId,
      128
    );

  const request =
    textOf(
      requestId,
      64
    ).toLowerCase();

  const gift =
    textOf(
      giftId,
      64
    );

  const title =
    textOf(
      name,
      120
    );

  const symbol =
    textOf(
      icon,
      64
    );

  if (!actor) {
    throw failure(
      "GAME_GIFT_ADMIN_ACTOR_REQUIRED",
      403
    );
  }

  if (!UUID.test(request)) {
    throw failure(
      "GAME_GIFT_ADMIN_REQUEST_INVALID",
      400
    );
  }

  if (!GIFT_ID.test(gift)) {
    throw failure(
      "GAME_GIFT_ADMIN_ID_INVALID",
      400
    );
  }

  if (!title || !symbol) {
    throw failure(
      "GAME_GIFT_ADMIN_PRESENTATION_INVALID",
      400
    );
  }

  if (typeof enabled !== "boolean") {
    throw failure(
      "GAME_GIFT_ADMIN_ENABLED_INVALID",
      400
    );
  }

  const price =
    priceOf(priceVnd);

  const charm =
    charmOf(charmAward);

  const {
    data,
    error,
  } = await supabase.rpc(
    "cing_game_gift_catalog_admin_upsert_v1",
    {
      p_actor_id:
        actor,

      p_request_id:
        request,

      p_gift_id:
        gift,

      p_name:
        title,

      p_icon:
        symbol,

      p_price_vnd:
        price,

      p_charm_award:
        charm,

      p_enabled:
        enabled,
    }
  );

  if (error) {
    throw failure(
      String(error.message || "").includes(
        "GAME_GIFT_ADMIN_REQUEST_CONFLICT"
      )
        ? "GAME_GIFT_ADMIN_REQUEST_CONFLICT"
        : "GAME_GIFT_ADMIN_UPSERT_UNVERIFIED",

      String(error.message || "").includes(
        "GAME_GIFT_ADMIN_REQUEST_CONFLICT"
      )
        ? 409
        : 503
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    typeof data.applied !== "boolean" ||
    data.request_id !== request ||
    data.catalog?.id !== gift ||
    data.catalog?.price_vnd?.toString() !==
      price ||
    data.catalog?.points_cost?.toString() !==
      (
        BigInt(price) / 1000n
      ).toString() ||
    data.catalog?.charm_award !==
      charm ||
    data.catalog?.enabled !==
      enabled
  ) {
    throw failure(
      "GAME_GIFT_ADMIN_RECEIPT_INVALID",
      502
    );
  }

  return data;
}

async function listGameGiftCatalog() {
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
    .order(
      "id",
      {
        ascending: true,
      }
    );

  if (error) {
    throw failure(
      "GAME_GIFT_ADMIN_LIST_FAILED",
      503
    );
  }

  if (!Array.isArray(data)) {
    throw failure(
      "GAME_GIFT_ADMIN_LIST_INVALID",
      502
    );
  }

  return data.map(row => {
    const price =
      priceOf(
        row.price_vnd
      );

    return {
      id:
        row.id,

      name:
        row.name,

      icon:
        row.icon,

      price_vnd:
        price,

      points_cost:
        (
          BigInt(price) / 1000n
        ).toString(),

      charm_award:
        row.charm_award,

      enabled:
        row.enabled,
    };
  });
}

module.exports = {
  upsertGameGiftCatalog,
  listGameGiftCatalog,
};
