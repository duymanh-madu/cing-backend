const {
  Server,
} = require(
  "socket.io"
);

const realtimeConnectionHandler =
  require(
    "../socket/realtime/realtimeConnectionHandler"
  );

const logger =
  require(
    "../services/loggerService"
  );

/**
 * =====================================================
 * SOCKET BOOTSTRAP
 * =====================================================
 */

function initializeSocket({
  server,
}) {

  const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://cinghutangkinhbac.vercel.app",
  ];

  const io =
    new Server(
      server,
      {

        /**
         * ============================================
         * CORS
         * ============================================
         */

        cors: {

          origin: (
            origin,
            callback
          ) => {

            /**
             * Browserless / mobile / Zalo
             */

            if (!origin) {

              return callback(
                null,
                true
              );

            }

            if (
              allowedOrigins.includes(
                origin
              )
            ) {

              return callback(
                null,
                true
              );

            }

            return callback(
              new Error(
                "CORS blocked"
              )
            );

          },

          methods: [
            "GET",
            "POST",
          ],

          credentials:
            true,

        },

        /**
         * ============================================
         * SOCKET ENGINE
         * ============================================
         */

        path:
          "/socket.io",

        transports: [
          "websocket",
          "polling",
        ],

        allowEIO3:
          true,

        pingTimeout:
          60000,

        pingInterval:
          25000,

        upgradeTimeout:
          30000,

        connectTimeout:
          30000,

        /**
         * Railway / proxy stability
         */

        serveClient:
          false,

      }
    );

  /**
   * ============================================
   * CONNECTION
   * ============================================
   */

  io.on(
    "connection",
    (
      socket
    ) => {

      logger.info(
        "Socket connected",
        {
          socketId:
            socket.id,
        }
      );

      realtimeConnectionHandler({

        io,

        socket,

      });

    }
  );

  /**
   * ============================================
   * ENGINE ERROR
   * ============================================
   */

  io.engine.on(
    "connection_error",
    (
      err
    ) => {

      logger.error(
        "Socket connection error",
        {
          message:
            err.message,

          code:
            err.code,

          context:
            err.context,
        }
      );

    }
  );

  logger.info(
    "Socket initialized"
  );

  return io;

}

module.exports = {

  initializeSocket,

};