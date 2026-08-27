const supabase = require("../../supabase");

const {
  processPaidOrderSettlement,
} = require("../payment/paidOrderSettlementProcessor");

function assertPaymentTransactionId(
  paymentTransactionId
) {
  const value =
    String(
      paymentTransactionId || ""
    ).trim();

  if (!value) {
    const error =
      new Error(
        "WALLET_PAYMENT_TRANSACTION_ID_REQUIRED"
      );

    error.code =
      "WALLET_PAYMENT_TRANSACTION_ID_REQUIRED";

    throw error;
  }

  return value;
}

async function settleWalletOrderPayment({
  req,
  paymentTransactionId,
}) {
  const authoritativePaymentTransactionId =
    assertPaymentTransactionId(
      paymentTransactionId
    );

  /*
   * PostgreSQL is the financial authority.
   *
   * The RPC:
   * - locks the canonical payment row,
   * - derives user + amount from that row,
   * - requires purpose=order,
   * - requires the Cing Wallet payment method,
   * - debits Wallet atomically,
   * - writes canonical internal settlement proof,
   * - consumes the settlement exactly once,
   * - returns a bounded canonical commerce handoff.
   *
   * No caller-controlled user_id or amount crosses this
   * boundary.
   */
  const {
    data: settlementRows,
    error: settlementError,
  } = await supabase.rpc(
    "cing_wallet_settle_order_payment_handoff_atomic",
    {
      p_payment_transaction_id:
        authoritativePaymentTransactionId,
    }
  );

  if (settlementError) {
    const error =
      new Error(
        settlementError.message ||
          "CING_WALLET_ORDER_PAYMENT_SETTLEMENT_FAILED"
      );

    error.code =
      settlementError.code ||
      "CING_WALLET_ORDER_PAYMENT_SETTLEMENT_FAILED";

    error.cause =
      settlementError;

    throw error;
  }

  const settlement =
    Array.isArray(settlementRows)
      ? settlementRows[0]
      : settlementRows;

  if (!settlement) {
    const error =
      new Error(
        "CING_WALLET_ORDER_PAYMENT_SETTLEMENT_EMPTY"
      );

    error.code =
      "CING_WALLET_ORDER_PAYMENT_SETTLEMENT_EMPTY";

    throw error;
  }

  const transactionCode =
    String(
      settlement.transaction_code ||
        ""
    ).trim();

  const settlementReference =
    String(
      settlement.settlement_reference ||
        ""
    ).trim();

  const amount =
    Number(
      settlement.amount
    );

  if (
    !transactionCode ||
    !settlementReference ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    const error =
      new Error(
        "CING_WALLET_ORDER_PAYMENT_SETTLEMENT_INVALID"
      );

    error.code =
      "CING_WALLET_ORDER_PAYMENT_SETTLEMENT_INVALID";

    throw error;
  }

  /*
   * Financial settlement is already durable before commerce
   * processing begins.
   *
   * Commerce therefore consumes only canonical values returned
   * by PostgreSQL. It must not independently debit Wallet or
   * reconstruct amount/user identity from the request.
   */
  const commerceCompletion =
    await processPaidOrderSettlement({
      req,
      orderId:
        transactionCode,
      transId:
        settlementReference,
      amount,
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
        "CING_WALLET_ORDER_COMMERCE_COMPLETION_REQUIRED"
      );

    error.code =
      "CING_WALLET_ORDER_COMMERCE_COMPLETION_REQUIRED";

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
      authoritativePaymentTransactionId,
    transaction_code:
      transactionCode,
    settlement_reference:
      settlementReference,
    amount,
  };
}

module.exports = {
  settleWalletOrderPayment,
};
