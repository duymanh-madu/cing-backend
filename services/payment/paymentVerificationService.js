const {

  findTransactionByCode,

  updateTransaction,

} = require(
  "./paymentTransactionService"
);

const {
  canTransition,
} = require(
  "./paymentStateMachine"
);

const {

  acquirePaymentLock,

  releasePaymentLock,

} = require(
  "./paymentLockService"
);

const {

  isReplayEvent,

  registerReplayEvent,

} = require(
  "./paymentReplayProtectionService"
);

const {
  broadcastPaymentPaid,
} = require(
  "./paymentRealtimeBroadcastService"
);

const {
  incrementRuntimeMetric,
} = require(
  "./paymentRuntimeRegistryService"
);

const {
  createPaymentAuditLog,
} = require(
  "./paymentAuditTrailService"
);

const {
  createReconciliationSnapshot,
} = require(
  "./paymentReconciliationService"
);

const {
  publishPaymentEvent,
} = require(
  "./paymentEventPublisher"
);

const PAYMENT_EVENT_TYPES =
  require(
    "./paymentEventTypes"
  );

const {
  createOrder,
} = require(
  "../orderService"
);

const {
  broadcastPaymentUpdate,
} = require(
  "./paymentRealtimeAdminBroadcastService"
);

async function verifyPayment({

  transaction_code,

  provider_transaction_id,

}) {

  const lockAcquired =

    acquirePaymentLock(
      transaction_code
    );

  if (!lockAcquired) {

    throw new Error(
      "Payment locked"
    );

  }

  try {

    const replayDetected =

      isReplayEvent({

        transaction_code,

        provider_transaction_id,

      });

    if (replayDetected) {

      throw new Error(
        "Replay webhook detected"
      );

    }

    const payment =

      await findTransactionByCode(
        transaction_code
      );

    if (!payment) {

      throw new Error(
        "Payment not found"
      );

    }

    const validTransition =

      canTransition({

        currentState:
          payment.payment_status,

        nextState:
          "paid",

      });

    if (!validTransition) {
      if (payment.payment_status === "paid" && !payment.order_created) {
        console.log("[VERIFY] Already paid but no order - allowing retry");
      } else {
        throw new Error(
          `Invalid payment transition: ${payment.payment_status} -> paid`
        );
      }
    }

    const updated =

      await updateTransaction({

        transactionId:
          payment.id,

        values: {

          payment_status:
            "paid",

          payment_session_status:
            "completed",

          provider_transaction_id,

          paid_at:
            new Date().toISOString(),

        },

      });

    const orderResult =
      await createOrder({

        user_id:
          payment.user_id,

        items:
          Array.isArray(payment.cart_snapshot) ? payment.cart_snapshot : (payment.cart_snapshot?.items || []),

        subtotal:
          payment.cart_snapshot?.subtotal || 0,

        shipping_fee:
          payment.cart_snapshot?.shipping_fee || 0,

        total:
          payment.amount,

        payment_status:
          "paid",

        payment_method:
          payment.payment_method,

        payment_transaction_id:
          payment.id,

      });

    registerReplayEvent({

      transaction_code,

      provider_transaction_id,

    });

    incrementRuntimeMetric(
      "paid_payments"
    );

    broadcastPaymentPaid(
      updated
    );

    await createPaymentAuditLog({

      transaction_code,

      action:
        "payment_verified",

      metadata: {

        provider_transaction_id,

      },

    });

    await createReconciliationSnapshot({

      transaction_code,

      payment_status:
        "paid",

      provider_transaction_id,

    });

    await publishPaymentEvent({

      type:

        PAYMENT_EVENT_TYPES.PAYMENT_PAID,

      payload: {

        payment:
          updated,

        order:
          orderResult.order,

        user_id:
          payment.user_id,

        transaction_code,

      },

    });

    return {

      payment:
        updated,

      order:
        orderResult.order,

    };

  } finally {

    releasePaymentLock(
      transaction_code
    );

  }

}

module.exports = {

  verifyPayment,

};