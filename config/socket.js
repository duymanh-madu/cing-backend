const { Server } = require("socket.io");

const attachRedisAdapter = require(
  "../services/infrastructure/cache/socketRedisAdapter"
);

function createSocket(server) {

  const io = new Server(server, {

    cors: {

      origin:
        process.env.SOCKET_CORS_ORIGIN || "*",

      credentials: true,

    },

    transports: [
      "websocket",
      "polling",
    ],

    pingTimeout: 60000,

    pingInterval: 25000,

    maxHttpBufferSize: 1e6,

  });

  /**
   * ==================================================
   * REDIS SOCKET ADAPTER
   * ==================================================
   */

  try {

    console.log(
      "🔥 attachRedisAdapter called"
    );

    attachRedisAdapter(io);

  } catch (error) {

    console.error(
      "❌ Failed to attach Redis adapter:",
      error
    );

  }

  /**
   * ==================================================
   * SOCKET READY
   * ==================================================
   */

  console.log(
    "✅ Socket.IO server created"
  );

  return io;

}

module.exports = {
  createSocket,
};