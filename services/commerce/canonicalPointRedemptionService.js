"use strict";

const supabase =
  require("../../supabase");


function pointPricingError(
  code,
  details = null
) {

  const error =
    new Error(code);

  error.code =
    code;

  if (details !== null) {
    error.details =
      details;
  }

  return error;

}


function normalizeWholeNonNegative(
  value,
  code
) {

  const numeric =
    Number(
      value ?? 0
    );

  if (
    !Number.isSafeInteger(numeric) ||
    numeric < 0
  ) {

    throw pointPricingError(
      code
    );

  }

  return numeric;

}


function normalizePositiveMoney(
  value,
  code
) {

  const numeric =
    Number(value);

  if (
    !Number.isSafeInteger(numeric) ||
    numeric < 1
  ) {

    throw pointPricingError(
      code
    );

  }

  return numeric;

}


function pricePointRedemption({
  requestedPoints,
  availablePoints,
  prePointsPayable,
  pointValueVnd,
}) {

  const requested =
    normalizeWholeNonNegative(
      requestedPoints,
      "COMMERCE_POINTS_REQUEST_INVALID"
    );

  const available =
    normalizeWholeNonNegative(
      availablePoints,
      "COMMERCE_POINTS_BALANCE_INVALID"
    );

  const payable =
    normalizeWholeNonNegative(
      prePointsPayable,
      "COMMERCE_POINTS_PAYABLE_INVALID"
    );

  const pointValue =
    normalizePositiveMoney(
      pointValueVnd,
      "COMMERCE_POINT_VALUE_INVALID"
    );


  /*
   * Full-point redemption only.
   *
   * Example:
   * payable = 36,100
   * value   = 1,000
   *
   * maximum = 36 points
   * remainder = 100 VND
   *
   * Never consume 37 points for only 36,100 VND of value.
   */
  const maxPointsByPayable =
    Math.floor(
      payable /
      pointValue
    );


  const maximumUsablePoints =
    Math.min(
      available,
      maxPointsByPayable
    );


  /*
   * Do not silently clamp stale client intent.
   *
   * If balance/payable changed, checkout must return the new
   * authority result instead of unexpectedly charging more
   * Wallet/provider money than the customer confirmed.
   */
  if (
    requested >
      available
  ) {

    throw pointPricingError(
      "COMMERCE_POINTS_INSUFFICIENT_BALANCE",
      {
        requested_points:
          requested,
        available_points:
          available,
      }
    );

  }


  if (
    requested >
      maxPointsByPayable
  ) {

    throw pointPricingError(
      "COMMERCE_POINTS_EXCEEDS_PAYABLE",
      {
        requested_points:
          requested,
        max_points_by_payable:
          maxPointsByPayable,
      }
    );

  }


  const pointsDiscount =
    requested *
    pointValue;


  if (
    !Number.isSafeInteger(
      pointsDiscount
    ) ||
    pointsDiscount < 0 ||
    pointsDiscount > payable
  ) {

    throw pointPricingError(
      "COMMERCE_POINTS_DISCOUNT_INVALID"
    );

  }


  const remainingPayable =
    payable -
    pointsDiscount;


  return {

    points_requested:
      requested,

    points_used:
      requested,

    point_value_vnd:
      pointValue,

    points_discount:
      pointsDiscount,

    pre_points_payable:
      payable,

    remaining_payable:
      remainingPayable,

    available_points:
      available,

    max_points_by_payable:
      maxPointsByPayable,

    maximum_usable_points:
      maximumUsablePoints,

  };

}


async function getCanonicalPointPolicy() {

  const {
    data,
    error,
  } = await supabase
    .from("app_configs")
    .select(
      "loyalty_point_value_vnd"
    )
    .limit(1)
    .maybeSingle();


  if (error) {

    throw pointPricingError(
      "COMMERCE_POINT_POLICY_READ_FAILED",
      {
        message:
          error.message,
      }
    );

  }


  if (!data) {

    throw pointPricingError(
      "COMMERCE_POINT_POLICY_MISSING"
    );

  }


  return {

    point_value_vnd:
      normalizePositiveMoney(
        data.loyalty_point_value_vnd,
        "COMMERCE_POINT_VALUE_INVALID"
      ),

  };

}


async function getCanonicalPointBalance(
  userId
) {

  const canonicalUserId =
    String(
      userId ?? ""
    ).trim();


  if (!canonicalUserId) {

    throw pointPricingError(
      "COMMERCE_POINTS_USER_REQUIRED"
    );

  }


  const {
    data,
    error,
  } = await supabase
    .from("players")
    .select(
      "total_points"
    )
    .eq(
      "user_id",
      canonicalUserId
    )
    .maybeSingle();


  if (error) {

    throw pointPricingError(
      "COMMERCE_POINTS_BALANCE_READ_FAILED",
      {
        message:
          error.message,
      }
    );

  }


  if (!data) {

    throw pointPricingError(
      "COMMERCE_POINTS_PLAYER_NOT_FOUND"
    );

  }


  return normalizeWholeNonNegative(
    data.total_points ?? 0,
    "COMMERCE_POINTS_BALANCE_INVALID"
  );

}


async function resolveCanonicalPointRedemption({
  userId,
  requestedPoints,
  prePointsPayable,
}) {

  const [
    policy,
    availablePoints,
  ] = await Promise.all([

    getCanonicalPointPolicy(),

    getCanonicalPointBalance(
      userId
    ),

  ]);


  return pricePointRedemption({

    requestedPoints,

    availablePoints,

    prePointsPayable,

    pointValueVnd:
      policy.point_value_vnd,

  });

}


module.exports = {

  pricePointRedemption,

  resolveCanonicalPointRedemption,

};
