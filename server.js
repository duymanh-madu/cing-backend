require("dotenv").config();

const http =
  require("http");

/**
 * =====================================================
 * BOOTSTRAP
 * =====================================================
 */

const {
  createApp,
} = require(
  "./bootstrap/appBootstrap"
);

const {
  initializeSocket,
} = require(
  "./bootstrap/socketBootstrap"
);

const {
  initializeWorkers,
} = require(
  "./bootstrap/workerBootstrap"
);

const {
  startupValidation,
} = require(
  "./bootstrap/startupValidation"
);

const {
  registerEvents,
} = require(
  "./core/events/registerEvents"
);

const logger =
  require(
    "./services/loggerService"
  );

const {
  validateEnv,
} = require(
  "./config/envValidator"
);

/**
 * =====================================================
 * APP
 * =====================================================
 */

const app =
  createApp();

/**
 * =====================================================
 * HTTP SERVER
 * =====================================================
 */

const server =
  http.createServer(app);

/**
 * =====================================================
 * SERVER TIMEOUTS
 * =====================================================
 */

server.keepAliveTimeout =
  65000;

server.headersTimeout =
  66000;

/**
 * =====================================================
 * PORT
 * =====================================================
 */

const PORT =
  process.env.PORT ||
  5050;

/**
 * =====================================================
 * SHUTDOWN STATE
 * =====================================================
 */

let isShuttingDown =
  false;

/**
 * =====================================================
 * SERVER REFERENCES
 * =====================================================
 */

let ioInstance =
  null;

/**
 * =====================================================
 * START APPLICATION
 * =====================================================
 */

async function startServer() {

  try {

    /**
     * ============================================
     * VALIDATION
     * ============================================
     */

    await startupValidation();

    validateEnv();

    logger.info(
      "Startup validation completed"
    );

    /**
     * ============================================
     * SOCKET
     * ============================================
     */

    ioInstance =
      initializeSocket({
        app,
        server,
      });

    if (!ioInstance) {

      throw new Error(
        "Socket initialization failed"
      );

    }

    logger.info(
      "Socket initialized"
    );

    /**
     * ============================================
     * EVENTS
     * ============================================
     */

    registerEvents();

    logger.info(
      "Events registered"
    );

    /**
     * ============================================
     * WORKERS
     * ============================================
     */

    await initializeWorkers();

    logger.info(
      "Workers initialized"
    );

    /**
     * ============================================
     * START HTTP SERVER
     * ============================================
     */

    server.listen(
      PORT,
      () => {

        logger.info(
          "Server booted successfully",
          {
            port: PORT,
            environment:
              process.env.NODE_ENV,
            realtime:
              true,
            pid:
              process.pid,
          }
        );

      }
    );

  } catch (error) {

    logger.error(
      "startup error",
      {
        message:
          error.message,

        stack:
          error.stack,
      }
    );

    process.exit(1);

  }

}

/**
 * =====================================================
 * PROCESS ERRORS
 * =====================================================
 */

process.on(
  "unhandledRejection",
  (reason) => {

    logger.error(
      "UNHANDLED REJECTION",
      {
        reason,
      }
    );

  }
);

process.on(
  "uncaughtException",
  (error) => {

    logger.error(
      "UNCAUGHT EXCEPTION",
      {
        message:
          error.message,

        stack:
          error.stack,
      }
    );

  }
);

/**
 * =====================================================
 * GRACEFUL SHUTDOWN
 * =====================================================
 */

async function shutdown(
  signal
) {

  try {

    if (isShuttingDown) {

      return;

    }

    isShuttingDown =
      true;

    logger.info(
      "Graceful shutdown started",
      {
        signal,
      }
    );

    /**
     * ============================================
     * SOCKET CLOSE
     * ============================================
     */

    if (ioInstance) {

      ioInstance.close();

      logger.info(
        "Socket server closed"
      );

    }

    /**
     * ============================================
     * HTTP CLOSE
     * ============================================
     */

    server.close(
      () => {

        logger.info(
          "HTTP server closed"
        );

        process.exit(0);

      }
    );

    /**
     * ============================================
     * FORCE EXIT
     * ============================================
     */

    setTimeout(
      () => {

        logger.error(
          "Forced shutdown timeout"
        );

        process.exit(1);

      },
      10000
    );

  } catch (error) {

    logger.error(
      "shutdown error",
      {
        message:
          error.message,

        stack:
          error.stack,
      }
    );

    process.exit(1);

  }

}

/**
 * =====================================================
 * SIGNALS
 * =====================================================
 */

process.on(
  "SIGINT",
  () =>
    shutdown("SIGINT")
);

process.on(
  "SIGTERM",
  () =>
    shutdown("SIGTERM")
);

/**
 * =====================================================
 * BOOT
 * =====================================================
 */

startServer();