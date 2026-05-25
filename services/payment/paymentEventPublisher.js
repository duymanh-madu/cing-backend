const paymentEventBus =
  require(
    "./paymentEventBus"
  );

const PAYMENT_EVENT_TYPES =
  require(
    "./paymentEventTypes"
  );

/**
 * =====================================================
 * EMIT EVENT
 * =====================================================
 */

function emitPaymentEvent({

  type,

  payload,

}) {

  if (!type) {

    throw new Error(
      "Payment event type required"
    );

  }

  paymentEventBus.emit(
    type,
    payload
  );

}

/**
 * =====================================================
 * PAYMENT CREATED
 * =====================================================
 */

function emitPaymentCreated(
  payload
) {

  emitPaymentEvent({

    type:
      PAYMENT_EVENT_TYPES.PAYMENT_CREATED,

    payload,

  });

}

/**
 * =====================================================
 * PAYMENT PAID
 * =====================================================
 */

function emitPaymentPaid(
  payload
) {

  emitPaymentEvent({

    type:
      PAYMENT_EVENT_TYPES.PAYMENT_PAID,

    payload,

  });

}

/**
 * =====================================================
 * PAYMENT FAILED
 * =====================================================
 */

function emitPaymentFailed(
  payload
) {

  emitPaymentEvent({

    type:
      PAYMENT_EVENT_TYPES.PAYMENT_FAILED,

    payload,

  });

}

/**
 * =====================================================
 * PAYMENT EXPIRED
 * =====================================================
 */

function emitPaymentExpired(
  payload
) {

  emitPaymentEvent({

    type:
      PAYMENT_EVENT_TYPES.PAYMENT_EXPIRED,

    payload,

  });

}

module.exports = {

  emitPaymentEvent,

  emitPaymentCreated,

  emitPaymentPaid,

  emitPaymentFailed,

  emitPaymentExpired,

};