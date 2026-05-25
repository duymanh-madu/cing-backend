const realtimeEmitterService =
  require("../realtime/realtimeEmitterService");

function emitPaymentStatus({

  transaction_code,

  payment_status,

  metadata,

}) {

  realtimeEmitterService.emit(

    "payment.status.updated",

    {
      transaction_code,

      payment_status,

      metadata:
        metadata || {},
    }
  );

}

module.exports = {

  emitPaymentStatus,

};