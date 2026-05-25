let ioInstance =
  null;

function registerPaymentAdminIO(
  io
) {

  ioInstance = io;

}

function broadcastPaymentUpdate(
  payload
) {

  if (!ioInstance) {

    return;

  }

  ioInstance
    .to("admin:payments")
    .emit(
      "payment:update",
      payload
    );

}

module.exports = {

  registerPaymentAdminIO,

  broadcastPaymentUpdate,

};