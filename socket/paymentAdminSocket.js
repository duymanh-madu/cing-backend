function registerPaymentAdminSocket(
  io
) {

  io.on(
    "connection",
    (socket) => {

      socket.on(
        "admin:payments:join",
        () => {

          socket.join(
            "admin:payments"
          );

        }
      );

    }
  );

}

module.exports = {

  registerPaymentAdminSocket,

};