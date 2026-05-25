const { Server } =
  require("socket.io");
const { realtimeEventBus } =
  require("../services/realtime/realtimeEventBus");
const { realtimeEventBus } =
  require("../services/realtime/realtimeEventBus");

const attachRedisAdapter =
  require(
    "../services/infrastructure/cache/socketRedisAdapter"
  );

const realtimeConnectionHandler =
  require(
    "../socket/realtime/realtimeConnectionHandler"
  );

const logger =
  require(
    "../services/loggerService"
  );

const {
  registerPaymentAdminSocket,
} = require(
  "../socket/paymentAdminSocket"
);

/**
 * =====================================================
 * SOCKET BOOTSTRAP
 * =====================================================
 */

function initializeSocket({
  server,
}) {

  /**
   * =====================================================
   * ALLOWED ORIGINS
   * =====================================================
   */

  const allowedOrigins = [

    "http://localhost:3000",

    "http://localhost:5173",

    "https://cinghutangkinhbac.vercel.app",

    process.env.FRONTEND_URL,

    process.env.ZALO_MINIAPP_URL,

  ].filter(Boolean);

  /**
   * =====================================================
   * SOCKET SERVER
   * =====================================================
   */

  const io = new Server(
    server,
    {

      cors: {

        origin: (
          origin,
          callback
        ) => {

          if (!origin) {

            return callback(
              null,
              true
            );

          }

          const normalizedOrigin =
            origin.trim();

          if (
            allowedOrigins.includes(
              normalizedOrigin
            )
          ) {

            return callback(
              null,
              true
            );

          }

          logger.error(
            "Socket CORS blocked",
            {
              origin:
                normalizedOrigin,
            }
          );

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

        credentials: true,

      },

      path: "/socket.io",

      transports: [
        "websocket",
        "polling",
      ],

      allowEIO3: true,

      pingTimeout: 60000,

      pingInterval: 25000,

      upgradeTimeout: 30000,

      connectTimeout: 30000,

      serveClient: false,

      perMessageDeflate: false,

      httpCompression: true,

      maxHttpBufferSize:
        1e6,

    }
  );

  /**
   * =====================================================
   * REDIS SOCKET ADAPTER
   * =====================================================
   */

  try {

    logger.info(
      "Attaching Redis adapter"
    );

    attachRedisAdapter(io);

    logger.info(
      "Redis adapter attached"
    );

  } catch (error) {

    logger.error(
      "Redis adapter attach failed",
      {
        message:
          error.message,

        stack:
          error.stack,
      }
    );

  }

  /**
   * =====================================================
   * ATTACH IO TO EVENT BUS - enables realtime dispatch
   * =====================================================
   */
  realtimeEventBus.setIO(io);

  /**
   * =====================================================
   * ATTACH IO TO EVENT BUS - enables realtime dispatch
   * =====================================================
   */
  realtimeEventBus.setIO(io);

  /**
   * =====================================================
   * PAYMENT ADMIN SOCKET
   * =====================================================
   */

  registerPaymentAdminSocket(
    io
  );

  /**
   * =====================================================
   * SOCKET CONNECTION
   * =====================================================
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

          transport:
            socket.conn.transport.name,
        }
      );

      realtimeConnectionHandler({

        io,

        socket,

      });

    }
  );

  /**
   * =====================================================
   * ENGINE ERRORS
   * =====================================================
   */

  io.engine.on(
    "connection_error",
    (
      error
    ) => {

      logger.error(
        "Socket connection error",
        {
          message:
            error.message,

          code:
            error.code,

          context:
            error.context,
        }
      );

    }
  );

  /**
   * =====================================================
   * SOCKET READY
   * =====================================================
   */

  logger.info(
    "Socket initialized"
  );

  return io;

}

module.exports = {
  initializeSocket,
};