"use strict";


function buildReadinessError({

  message,
  code,
  statusCode = 503,

}) {

  const error =
    new Error(
      message
    );

  error.code =
    code;

  error.statusCode =
    statusCode;

  return error;

}


function getConfiguredPointsPaymentMethod() {

  return String(
    process.env
      .IPOS_POINTS_PAYMENT_METHOD ||
    ""
  ).trim();

}


/*
 * Operational capability only.
 *
 * This service must never:
 * - price points
 * - read player balance
 * - alter canonical checkout totals
 * - create payment transactions
 * - reserve points
 * - settle payment
 *
 * The canonical checkout layer invokes it only after canonical
 * pricing has already established that the order is points-only.
 */
function assertPointsOnlyCommerceReadiness() {

  const paymentMethod =
    getConfiguredPointsPaymentMethod();

  if (!paymentMethod) {

    throw buildReadinessError({

      message:
        "Thanh toán toàn bộ đơn hàng bằng điểm hiện chưa sẵn sàng",

      code:
        "COMMERCE_POINTS_ONLY_TENDER_NOT_READY",

      statusCode:
        503,

    });

  }

  return {

    ready: true,

  };

}


module.exports = {

  assertPointsOnlyCommerceReadiness,

};
