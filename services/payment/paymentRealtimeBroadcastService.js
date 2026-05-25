const realtimeEmitterService =
  require("../realtime/realtimeEmitterService");

function broadcastPaymentCreated(
  payment
) {

  realtimeEmitterService.emit(

    "payment.created",

    {
      transaction_code:
        payment.transaction_code,

      amount:
        payment.amount,

      payment_status:
        payment.payment_status,

      created_at:
        new Date().toISOString(),

    }
  );

}

function broadcastPaymentPaid(
  payment
) {

  realtimeEmitterService.emit(

    "payment.paid",

    {
      transaction_code:
        payment.transaction_code,

      amount:
        payment.amount,

      payment_status:
        payment.payment_status,

      paid_at:
        payment.paid_at,

    }
  );

}

function broadcastPaymentFailed(
  payload
) {

  realtimeEmitterService.emit(

    "payment.failed",

    payload
  );

}

module.exports = {

  broadcastPaymentCreated,

  broadcastPaymentPaid,

  broadcastPaymentFailed,

};