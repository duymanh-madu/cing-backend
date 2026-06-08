const { Server } = require("socket.io");

const attachRedisAdapter = require(
  "../services/infrastructure/cache/socketRedisAdapter"
);

function createSocket(server) {

  const io = new Server(server, {

    cors: {

      origin: (() => {
        const o = process.env.SOCKET_CORS_ORIGIN || "*";
        if (o === "*") return "*";
        const list = o.split(",").map(s => s.trim());
        return list.length === 1 ? list[0] : list;
      })(),

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