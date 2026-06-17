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
  incrementRuntimeMetric,
} = require(
  "./paymentRuntimeRegistryService"
);

async function createPaymentSession(
  payload
) {

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

      amount:
        payload.total_amount,

      cart_snapshot:
        payload.cart_snapshot,

      expired_at,

    });

  incrementRuntimeMetric(
    "active_payments"
  );

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
        `Thanh toán đơn hàng ${transaction.transaction_code}`,

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

    paymentUrl:
      providerResult.paymentUrl || null,

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
