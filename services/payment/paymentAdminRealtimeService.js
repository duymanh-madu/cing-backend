const realtimeEmitterService =
  require("../realtime/realtimeEmitterService");

function emitAdminPaymentEvent(
  event,
  payload
) {

  realtimeEmitterService.emit(

    `admin.payment.${event}`,

    payload
  );

}

module.exports = {

  emitAdminPaymentEvent,

};