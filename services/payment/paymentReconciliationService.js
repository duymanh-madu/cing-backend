const supabase =
  require("../../supabase");

const {
  findOwnedPaymentByCode,
} = require(
  "./paymentCustomerOwnershipService"
);

const {
  assertWalletMomoTopupEnabled,
} = require(
  "./walletMomoTopupRuntimeGate"
);


/*
 * =====================================================
 * LEGACY RECONCILIATION SNAPSHOT
 * =====================================================
 *
 * Snapshot storage is observational only.
 * It is not payment or settlement authority.
 */

async function createReconciliationSnapshot({
  transaction_code,
  payment_status,
  provider_transaction_id,
}) {
  const {
    error,
  } = await supabase
    .from(
      "payment_reconciliation_snapshots"
    )
    .insert({
      transaction_code,
      payment_status,
      provider_transaction_id,
      snapshot_at:
        new Date().toISOString(),
    });

  if (error) {
    console.error(
      "[PAYMENT RECONCILIATION] snapshot persistence failed:",
      error.message
    );
  }
}


/*
 * =====================================================
 * DURABLE WALLET MOMO RECONCILIATION ADAPTER V1
 * =====================================================
 *
 * This service intentionally does NOT:
 * - query MoMo
 * - claim reconciliation leases
 * - settle Wallet
 * - keep retry state in RAM
 *
 * Its only mutation is ensuring that an eligible payment
 * exists in PostgreSQL durable reconciliation authority.
 *
 * Provider query / proof / settlement remains exclusively
 * owned by the fenced reconciliation worker.
 */

function reconciliationError({
  message,
  code,
  statusCode,
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    statusCode;

  return error;
}


async function ensureWalletTopupReconciliation(
  paymentTransactionId
) {
  const {
    data,
    error,
  } = await supabase.rpc(
    "cing_payment_ensure_wallet_topup_reconciliation_v1",
    {
      p_payment_transaction_id:
        paymentTransactionId,
    }
  );

  if (error) {
    throw reconciliationError({
      message:
        error.message,
      code:
        "PAYMENT_RECONCILIATION_ENROLL_FAILED",
      statusCode:
        500,
    });
  }

  return Array.isArray(data)
    ? data[0] || null
    : data || null;
}


async function reconcilePayment({
  transaction_code,
  customer,
}) {
  const payment =
    await findOwnedPaymentByCode({
      transactionCode:
        transaction_code,

      customer,
    });

  /*
   * V1 durable reconciliation authority is intentionally
   * restricted to Cing Wallet top-ups through MoMo.
   *
   * Do not silently route commerce/order payments into
   * Wallet reconciliation authority.
   */
  if (
    payment.payment_purpose !==
      "wallet_topup" ||
    String(
      payment.payment_provider || ""
    )
      .trim()
      .toLowerCase() !==
      "momo"
  ) {
    throw reconciliationError({
      message:
        "Giao dịch này không thuộc luồng đối soát Cing Wallet MoMo",
      code:
        "PAYMENT_RECONCILIATION_UNSUPPORTED",
      statusCode:
        409,
    });
  }

  /*
   * Same fail-closed deployment entitlement used by:
   * - top-up creation
   * - reconciliation worker
   *
   * Disabled means this manual adapter cannot create a
   * path around the production/legal provider gate.
   */
  assertWalletMomoTopupEnabled();

  const job =
    await ensureWalletTopupReconciliation(
      payment.id
    );

  return {
    transaction_code:
      payment.transaction_code,

    payment_status:
      payment.payment_status,

    payment_purpose:
      payment.payment_purpose,

    payment_provider:
      payment.payment_provider,

    reconciliation:
      {
        durable:
          true,

        enrolled:
          true,

        status:
          job?.status ||
          null,

        payment_transaction_id:
          payment.id,
      },
  };
}


module.exports = {
  createReconciliationSnapshot,
  reconcilePayment,
};
