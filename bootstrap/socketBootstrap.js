const {
  Server,
} = require(
  "socket.io"
);

/**
 * =========================================================
 * SOCKET BOOTSTRAP
 * =========================================================
 */

function initializeSocket({
  app,
  server,
}) {

  /**
   * =======================================================
   * ALLOWED ORIGINS
   * =======================================================
   */

  const allowedOrigins = [

    process.env.CLIENT_URL,

    "http://localhost:3000",

    "http://127.0.0.1:3000",

  ].filter(Boolean);

  /**
   * =======================================================
   * SOCKET SERVER
   * =======================================================
   */

  const io =
    new Server(
      server,
      {

        /**
         * =================================================
         * SOCKET PATH
         * =================================================
         */

        path:
          "/socket.io",

        /**
         * =================================================
         * CORS
         * =================================================
         */

        cors: {

          origin:
            (
              origin,
              callback
            ) => {

              /**
               * =============================================
               * SERVER TO SERVER / NO ORIGIN
               * =============================================
               */

              if (
                !origin
              ) {

                return callback(
                  null,
                  true
                );

              }

              /**
               * =============================================
               * ALLOWED
               * =============================================
               */

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

              /**
               * =============================================
               * BLOCK
               * =============================================
               */

              console.error(
                "❌ BLOCKED SOCKET ORIGIN:",
                origin
              );

              return callback(
                new Error(
                  "Socket CORS blocked"
                )
              );

            },

          credentials:
            true,

          methods: [
            "GET",
            "POST",
          ],

        },

        /**
         * =================================================
         * TRANSPORTS
         * =================================================
         */

        transports: [
          "polling",
          "websocket",
        ],

        /**
         * =================================================
         * CONNECTION STABILITY
         * =================================================
         */

        pingTimeout:
          60000,

        pingInterval:
          25000,

        connectTimeout:
          30000,

        /**
         * =================================================
         * MOBILE NETWORK STABILITY
         * =================================================
         */

        upgradeTimeout:
          30000,

        maxHttpBufferSize:
          1e6,

        /**
         * =================================================
         * COMPATIBILITY
         * =================================================
         */

        allowEIO3:
          false,

        /**
         * =================================================
         * COOKIE
         * =================================================
         */

        cookie:
          false,

        /**
         * =================================================
         * CLEANUP
         * =================================================
         */

        cleanupEmptyChildNamespaces:
          true,

      }
    );

  /**
   * =======================================================
   * APP INJECTION
   * =======================================================
   */

  app.set(
    "io",
    io
  );

  /**
   * =======================================================
   * SOCKET EVENTS
   * =======================================================
   */

  io.on(
    "connection",
    (
      socket
    ) => {

      /**
       * ===================================================
       * CONNECTED
       * ===================================================
       */

      console.log(
        "🟢 Socket connected:",
        socket.id
      );

      /**
       * ===================================================
       * CLIENT PING
       * ===================================================
       */

      socket.on(
        "client_ping",
        () => {

          socket.emit(
            "server_pong"
          );

        }
      );

      /**
       * ===================================================
       * USER CHANNEL
       * ===================================================
       */

      socket.on(
        "join_user_channel",
        (
          payload
        ) => {

          const userId =
            payload?.user_id;

          if (
            !userId
          ) {

            return;

          }

          const roomName =
            `user:${userId}`;

          socket.join(
            roomName
          );

          console.log(
            `👤 User joined room: ${roomName}`
          );

        }
      );

      /**
       * ===================================================
       * DISCONNECT
       * ===================================================
       */

      socket.on(
        "disconnect",
        (
          reason
        ) => {

          console.log(
            "🔴 Socket disconnected:",
            socket.id,
            reason
          );

        }
      );

      /**
       * ===================================================
       * SOCKET ERROR
       * ===================================================
       */

      socket.on(
        "error",
        (
          error
        ) => {

          console.error(
            "❌ Socket error:",
            {
              id:
                socket.id,

              message:
                error?.message,

              stack:
                error?.stack,
            }
          );

        }
      );

    }
  );

  /**
   * =======================================================
   * ENGINE EVENTS
   * =======================================================
   */

  io.engine.on(
    "connection_error",
    (
      error
    ) => {

      console.error(
        "❌ ENGINE CONNECTION ERROR",
        {
          code:
            error.code,

          message:
            error.message,

          context:
            error.context,
        }
      );

    }
  );

  /**
   * =======================================================
   * READY
   * =======================================================
   */

  console.log(
    "🚀 Socket.IO initialized"
  );

  /**
   * =======================================================
   * RETURN
   * =======================================================
   */

  return io;

}

module.exports = {
  initializeSocket,
};