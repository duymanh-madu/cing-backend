const PAYMENT_EVENT_TYPES = {

  PAYMENT_CREATED:
    "payment.created",

  PAYMENT_PENDING:
    "payment.pending",

  PAYMENT_PROCESSING:
    "payment.processing",

  PAYMENT_PAID:
    "payment.paid",

  PAYMENT_FAILED:
    "payment.failed",

  PAYMENT_EXPIRED:
    "payment.expired",

  PAYMENT_REFUNDED:
    "payment.refunded",

  PAYMENT_RETRYING:
    "payment.retrying",

  PAYMENT_PROVIDER_ERROR:
    "payment.provider.error",

  PAYMENT_WEBHOOK_RECEIVED:
    "payment.webhook.received",

  PAYMENT_RECONCILIATION_REQUIRED:
    "payment.reconciliation.required",

};

module.exports =
  PAYMENT_EVENT_TYPES;