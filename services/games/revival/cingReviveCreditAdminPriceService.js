"use strict";

/*
 * CING GAME CENTER V2
 * ADMIN REVIVE CREDIT PRICE SERVICE
 *
 * One canonical price:
 *
 * app_configs.wallet_revive_credit_price
 *
 * NULL means purchasing is disabled.
 *
 * No direct config UPDATE from JavaScript.
 * No Wallet, Points or Revive balance mutation.
 */

const supabase =
  require("../../../supabase");

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

function actorOf(value) {
  const actor =
    typeof value === "string"
      ? value.trim()
      : "";

  if (
    !actor ||
    actor.length > 128
  ) {
    throw failure(
      "REVIVE_ADMIN_ACTOR_INVALID",
      403
    );
  }

  return actor;
}

function requestOf(value) {
  const request =
    typeof value === "string"
      ? value.trim().toLowerCase()
      : "";

  if (!UUID.test(request)) {
    throw failure(
      "REVIVE_ADMIN_REQUEST_INVALID",
      400
    );
  }

  return request;
}

/*
 * NULL is a deliberate Admin action.
 *
 * An omitted value is NOT the same as NULL.
 * This prevents accidentally disabling purchases
 * through an incomplete request.
 */

function priceOf(value) {
  if (value === null) {
    return null;
  }

  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    throw failure(
      "REVIVE_ADMIN_PRICE_INVALID",
      400
    );
  }

  if (
    typeof value === "number" &&
    !Number.isSafeInteger(value)
  ) {
    throw failure(
      "REVIVE_ADMIN_PRICE_INVALID",
      400
    );
  }

  const text =
    String(value);

  if (
    !/^[1-9][0-9]*$/.test(text)
  ) {
    throw failure(
      "REVIVE_ADMIN_PRICE_INVALID",
      400
    );
  }

  const price =
    BigInt(text);

  if (
    price < 1000n ||
    price % 1000n !== 0n ||
    price / 1000n > MAX_POINTS
  ) {
    throw failure(
      "REVIVE_ADMIN_PRICE_INVALID",
      400
    );
  }

  return price.toString();
}

function moneyOf(value) {
  if (value === null) {
    return null;
  }

  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    throw failure(
      "REVIVE_ADMIN_RECEIPT_INVALID",
      502
    );
  }

  const text =
    String(value);

  if (!/^(0|[1-9][0-9]*)$/.test(text)) {
    throw failure(
      "REVIVE_ADMIN_RECEIPT_INVALID",
      502
    );
  }

  return text;
}

function verifyReceipt(
  data,
  request,
  price
) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    typeof data.applied !== "boolean" ||
    data.request_id !== request ||
    typeof data.enabled !== "boolean"
  ) {
    throw failure(
      "REVIVE_ADMIN_RECEIPT_INVALID",
      502
    );
  }

  const receiptPrice =
    moneyOf(
      data.price_vnd
    );

  const receiptPoints =
    moneyOf(
      data.points_cost
    );

  const expectedPoints =
    price === null
      ? null
      : (
        BigInt(price) / 1000n
      ).toString();

  if (
    receiptPrice !== price ||
    receiptPoints !== expectedPoints ||
    data.enabled !==
      (price !== null)
  ) {
    throw failure(
      "REVIVE_ADMIN_RECEIPT_INVALID",
      502
    );
  }

  /*
   * Verify replay receipt as well as
   * first-application receipt.
   *
   * Previous price is historical and
   * can legitimately differ from the
   * current configured price.
   */

  if (
    data.previous_price_vnd !== null
  ) {
    priceOf(
      data.previous_price_vnd
    );
  }

  return {
    applied:
      data.applied,

    request_id:
      request,

    previous_price_vnd:
      data.previous_price_vnd === null
        ? null
        : String(
          data.previous_price_vnd
        ),

    price_vnd:
      receiptPrice,

    points_cost:
      receiptPoints,

    enabled:
      data.enabled,
  };
}

async function setReviveCreditAdminPrice({
  actorId,
  requestId,
  priceVnd,
}) {
  const actor =
    actorOf(
      actorId
    );

  const request =
    requestOf(
      requestId
    );

  const price =
    priceOf(
      priceVnd
    );

  const {
    data,
    error,
  } = await supabase.rpc(
    "cing_revive_credit_admin_set_price_v1",
    {
      p_actor_id:
        actor,

      p_request_id:
        request,

      p_price_vnd:
        price,
    }
  );

  if (error) {
    const conflict =
      String(
        error.message || ""
      ).includes(
        "REVIVE_ADMIN_REQUEST_CONFLICT"
      );

    throw failure(
      conflict
        ? "REVIVE_ADMIN_REQUEST_CONFLICT"
        : "REVIVE_ADMIN_PRICE_UNVERIFIED",

      conflict
        ? 409
        : 503
    );
  }

  return verifyReceipt(
    data,
    request,
    price
  );
}

async function getReviveCreditAdminPrice() {
  const {
    data,
    error,
  } = await supabase
    .from("app_configs")
    .select(
      "wallet_revive_credit_price"
    )
    .eq("id", 1)
    .single();

  if (
    error ||
    !data ||
    typeof data !== "object"
  ) {
    throw failure(
      "REVIVE_ADMIN_PRICE_READ_FAILED",
      503
    );
  }

  const raw =
    data.wallet_revive_credit_price;

  const price =
    raw === null
      ? null
      : priceOf(raw);

  return {
    price_vnd:
      price,

    points_cost:
      price === null
        ? null
        : (
          BigInt(price) / 1000n
        ).toString(),

    enabled:
      price !== null,
  };
}

module.exports = {
  setReviveCreditAdminPrice,
  getReviveCreditAdminPrice,
};
