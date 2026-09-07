"use strict";

const supabase =
  require("../../supabase");

const {
  processPaidOrderSettlement,
} = require(
  "./paidOrderSettlementProcessor"
);


function normalizePaymentId(
  value
) {

  const numeric =
    Number(value);

  if (
    !Number.isSafeInteger(numeric) ||
    numeric <= 0
  ) {

    const error =
      new Error(
        "COMMERCE_POINTS_ONLY_PAYMENT_ID_INVALID"
      );

    error.code =
      "COMMERCE_POINTS_ONLY_PAYMENT_ID_INVALID";

    throw error;

  }

  return numeric;

}


async function settlePointsOnlyPayment({
  paymentTransactionId,
}) {

  const paymentId =
    normalizePaymentId(
      paymentTransactionId
    );


  const {
    data,
    error,
  } = await supabase.rpc(
    "cing_commerce_settle_points_only_payment_v1",
    {
      p_payment_transaction_id:
        paymentId,
    }
  );


  if (error) {

    const failure =
      new Error(
        error.message ||
        "COMMERCE_POINTS_ONLY_SETTLEMENT_FAILED"
      );

    failure.code =
      "COMMERCE_POINTS_ONLY_SETTLEMENT_FAILED";

    throw failure;

  }


  if (
    !data ||
    Number(
      data.id
    ) !== paymentId ||
    data.payment_status !==
      "paid" ||
    data.payment_method !==
      "points" ||
    data.payment_provider !==
      "internal" ||
    Number(
      data.amount
    ) !== 0 ||
    data.settlement_verification_method !==
      "commerce_points_internal_atomic"
  ) {

    const failure =
      new Error(
        "COMMERCE_POINTS_ONLY_SETTLEMENT_INVALID"
      );

    failure.code =
      "COMMERCE_POINTS_ONLY_SETTLEMENT_INVALID";

    throw failure;

  }


  return {

    success: true,

    payment_transaction_id:
      paymentId,

    transaction_code:
      data.transaction_code,

    amount:
      0,

    settlement_reference:
      data.settlement_reference,

    payment:
      data,

  };

}




async function settlePointsOnlyOrderPayment({
  req,
  paymentTransactionId,
}) {

  /*
   * Financial proof first.
   *
   * PostgreSQL accepts payment identity only and verifies:
   *
   * - order purpose
   * - method=points
   * - provider=internal
   * - amount=0
   * - full frozen point coverage
   * - matching reservation
   */
  const settlement =
    await settlePointsOnlyPayment({
      paymentTransactionId,
    });


  const payment =
    settlement.payment;


  const transactionCode =
    String(
      payment?.transaction_code ||
      ""
    ).trim();


  const settlementReference =
    String(
      settlement.settlement_reference ||
      ""
    ).trim();


  if (
    !transactionCode ||
    !settlementReference ||
    Number(payment?.amount) !== 0
  ) {

    const error =
      new Error(
        "COMMERCE_POINTS_ONLY_HANDOFF_INVALID"
      );

    error.code =
      "COMMERCE_POINTS_ONLY_HANDOFF_INVALID";

    throw error;

  }


  /*
   * Commerce materialization occurs only after the internal
   * financial settlement is durable.
   *
   * Shared completion:
   *
   * - creates/replays exactly one order,
   * - consumes the point reservation through the durable effect,
   * - pushes downstream effects through the existing pipeline.
   */
  const commerceCompletion =
    await processPaidOrderSettlement({

      req,

      orderId:
        transactionCode,

      transId:
        settlementReference,

      amount:
        0,

    });


  if (
    commerceCompletion?.success !==
      true ||
    commerceCompletion?.completed !==
      true ||
    !commerceCompletion?.order_id
  ) {

    const error =
      new Error(
        "COMMERCE_POINTS_ONLY_COMPLETION_REQUIRED"
      );

    error.code =
      "COMMERCE_POINTS_ONLY_COMPLETION_REQUIRED";

    throw error;

  }


  return {

    success: true,

    completed: true,

    order_id:
      commerceCompletion.order_id,

    order_code:
      commerceCompletion.order_code,

    payment_transaction_id:
      settlement.payment_transaction_id,

    transaction_code:
      transactionCode,

    settlement_reference:
      settlementReference,

    amount:
      0,

  };

}


module.exports = {

  settlePointsOnlyPayment,

  settlePointsOnlyOrderPayment,

};
