'use strict';
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


  // Points are whole units. The final unit may cover a partial 1,000đ
  // remainder for a zero-cash order; the monetary discount is capped below.
  const maxPointsByPayable =
    Math.ceil(
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


  const nominalDiscount = requested * pointValue;
  if (!Number.isSafeInteger(nominalDiscount)) {
    throw pointPricingError("COMMERCE_POINTS_DISCOUNT_INVALID");
  }
  const pointsDiscount = Math.min(nominalDiscount, payable);


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



module.exports={pricePointRedemption};
