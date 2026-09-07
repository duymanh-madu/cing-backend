const {
  getPaymentProvider,
} = require(
  "./paymentProviderRegistry"
);

const {

  createTransaction,

  updateTransaction,

} = require(
  "./paymentTransactionService"
);

const { emitPaymentCreated } = require("./paymentEventPublisher");
const publishPaymentCreated = emitPaymentCreated;

const {
  broadcastPaymentCreated,
} = require(
  "./paymentRealtimeBroadcastService"
);

const {
  enqueuePaymentJob,
} = require(
  "./paymentQueueService"
);

const {
  reservePaymentPoints,
} = require(
  "./commercePointReservationService"
);

const {
  incrementRuntimeMetric,
} = require(
  "./paymentRuntimeRegistryService"
);

async function createPaymentSession(
  payload
) {

  const paymentPurpose =
    payload.payment_purpose === "wallet_topup"
      ? "wallet_topup"
      : "order";

  const expired_at =
    new Date(
      Date.now() +
      15 * 60 * 1000
    ).toISOString();

  const transaction =

    await createTransaction({

      user_id:
        payload.user_id,

      payment_provider:
        payload.payment_provider,

      payment_method:
        payload.payment_method,

      payment_purpose:
        paymentPurpose,

      amount:
        payload.total_amount,

      cart_snapshot:
        payload.cart_snapshot,

      expired_at,

    });

  /*
   * Commerce funding sequencing authority:
   *
   * The durable payment transaction must exist first because
   * PostgreSQL accepts payment identity only.
   *
   * Point reservation MUST complete before:
   *
   * - any external provider.createPayment()
   * - Cing Wallet debit/settlement handoff
   *
   * This prevents a payment rail from becoming irreversible
   * before loyalty funding is safely held.
   */
  const pointReservation =
    paymentPurpose === "order"
      ? await reservePaymentPoints({
          paymentTransactionId:
            transaction.id,
        })
      : null;

  incrementRuntimeMetric(
    "active_payments"
  );

  /*
   * Points-only is an internal zero-money rail.
   *
   * The payment transaction and reservation already exist.
   * The checkout layer owns the bounded settlement/completion
   * handoff, exactly like the Cing Wallet route.
   *
   * No external provider may receive amount=0.
   */
  if (
    paymentPurpose === "order" &&
    payload.payment_method ===
      "points" &&
    payload.payment_provider ===
      "internal" &&
    Number(payload.total_amount) ===
      0
  ) {

    return {

      success: true,

      payment:
        transaction,

      pointReservation,

      internalRail:
        "points",

      paymentUrl: null,

      qrContent: null,

      zaloOrder: null,

      expired_at,

    };

  }


  /*
   * Cing Wallet is an internal settlement rail.
   *
   * The checkout layer needs the durable canonical payment
   * transaction ID before invoking PostgreSQL Wallet settlement.
   * It must never dispatch Cing Wallet to an external provider.
   */
  if (
    payload.payment_method ===
      "cing_wallet"
  ) {
    return {
      success: true,
      payment:
        transaction,

      pointReservation,
      paymentUrl: null,
      qrContent: null,
      zaloOrder: null,
      expired_at,
    };
  }

  const provider =

    getPaymentProvider(
      payload.payment_provider
    );

  const providerResult =

    await provider.createPayment({

      transactionCode:
        transaction.transaction_code,

      amount:
        payload.total_amount,

      description:
        paymentPurpose === "wallet_topup"
          ? `Nạp tiền Cing Wallet ${transaction.transaction_code}`
          : `Thanh toán đơn hàng ${transaction.transaction_code}`,

      cartSnapshot:
        payload.cart_snapshot,

    });

  const updated =

    await updateTransaction({

      transactionId:
        transaction.id,

      values: {

        provider_transaction_id:
          providerResult.providerTransactionId,

        provider_response:
          providerResult.raw || {},

      },

    });

  enqueuePaymentJob({

    transaction_code:
      updated.transaction_code,

    provider:
      updated.payment_provider,

  });

  await publishPaymentCreated(
    updated
  );

  broadcastPaymentCreated(
    updated
  );

  return {

    success: true,

    payment:
      updated,

    pointReservation,

    paymentUrl:
      providerResult.paymentUrl || null,


    deeplink:
      providerResult.deeplink || null,

    deeplinkMiniApp:
      providerResult.deeplinkMiniApp || null,

    qrContent:
      providerResult.qrContent || null,

    zaloOrder:
      updated.payment_provider === "zalo_checkout"
        ? providerResult.raw
        : null,

    expired_at,

  };

}

module.exports = {

  createPaymentSession,

};const paymentFlow = require("./paymentFlowDefinition");
