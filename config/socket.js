const {
  Server,
} = require(
  "socket.io"
);

function createSocket(
  server
) {

  const io =
    new Server(server, {

      cors: {

        origin:

          process.env
            .SOCKET_CORS_ORIGIN ||

          "*",

        credentials:
          true,

      },

      transports: [
        "websocket",
        "polling",
      ],

      pingTimeout:
        60000,

      pingInterval:
        25000,

      maxHttpBufferSize:
        1e6,

    });

  return io;

}

module.exports = {

  createSocket,

};