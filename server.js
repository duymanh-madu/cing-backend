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
 * ROUTES
 * =====================================================
 */


/**
 * =====================================================
 * APP
 * =====================================================
 */

const app = createApp();

/**
 * =====================================================
 * API PREFIX
 * =====================================================
 */

const API_PREFIX =
  "/api";

/**
 * =====================================================
 * API ROUTES
 * =====================================================
 */

/**
 * =====================================================
 * ROOT
 * =====================================================
 */

app.get(
  "/",
  (
    req,
    res
  ) => {

    return res.json({

      success: true,

      app:
        "CING HU TANG BACKEND",

      realtime: true,

      websocket: true,

      payment: true,

      ipos: true,

      environment:
        process.env.NODE_ENV,

      timestamp:
        Date.now(),

    });

  }
);

/**
 * =====================================================
 * HEALTHCHECK
 * =====================================================
 */

app.get(
  "/health",
  (
    req,
    res
  ) => {

    return res.json({

      success: true,

      realtime: true,

      websocket: true,

      payment: true,

      uptime:
        process.uptime(),

      environment:
        process.env.NODE_ENV,

      memory: {

        rss:
          process.memoryUsage()
            .rss,

        heapUsed:
          process.memoryUsage()
            .heapUsed,

      },

      timestamp:
        Date.now(),

    });

  }
);

/**
 * =====================================================
 * PAYMENT HEALTH
 * =====================================================
 */

app.get(
  "/payment-health",
  (
    req,
    res
  ) => {

    return res.json({

      success: true,

      momo: {

        enabled:
          !!process.env
            .MOMO_PARTNER_CODE,

        endpoint:
          process.env
            .MOMO_ENDPOINT ||

          "https://payment.momo.vn/v2/gateway/api/create",

      },

      webhook: {

        enabled:
          !!process.env
            .PAYMENT_WEBHOOK_SECRET,

      },

      timestamp:
        Date.now(),

    });

  }
);

/**
 * =====================================================
 * 404 HANDLER
 * =====================================================
 */

/**
 * =====================================================
 * HTTP SERVER
 * =====================================================
 */

const server =
  http.createServer(
    app
  );

/**
 * =====================================================
 * SERVER TIMEOUTS
 * =====================================================
 */

server.keepAliveTimeout =
  65000;

server.headersTimeout =
  66000;

server.requestTimeout =
  120000;

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
 * SOCKET INSTANCE
 * =====================================================
 */

let ioInstance =
  null;

/**
 * =====================================================
 * START SERVER
 * =====================================================
 */

async function startServer() {

  try {

    /**
     * ============================================
     * STARTUP VALIDATION
     * ============================================
     */

    await startupValidation();

    validateEnv();

    logger.info(
      "Startup validation completed"
    );

    /**
     * ============================================
     * SOCKET BOOT
     * ============================================
     */

    ioInstance =
      initializeSocket({

        app,

        server,

      });

    if (
      !ioInstance
    ) {

      throw new Error(
        "Socket initialization failed"
      );

    }

    logger.info(
      "Socket initialized"
    );
    
    // Track online users
    global.onlineUsers = new Map(); // userId → { socketId, connectedAt, name, avatar }
    
    ioInstance.on('connection', (socket) => {
      socket.on('user:online', ({ userId, name, avatar }) => {
        if (!userId) return;
        global.onlineUsers.set(String(userId), {
          socketId: socket.id,
          userId: String(userId),
          name, avatar,
          connectedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        });
        // Update lastSeen trong DB
        require('./supabase').from('players')
          .update({ last_seen_at: new Date().toISOString(), is_online: true })
          .eq('user_id', String(userId)).then(()=>{}).catch(()=>{});
      });
      
      // Track page hiện tại của user
      socket.on('user:page', ({ userId, page, action }) => {
        if (!userId) return;
        const u = global.onlineUsers.get(String(userId));
        if (u) {
          u.currentPage = page || '';
          u.currentAction = action || '';
          u.lastActivity = new Date().toISOString();
          global.onlineUsers.set(String(userId), u);
        }
      });

      socket.on('disconnect', () => {
        for (const [uid, u] of global.onlineUsers.entries()) {
          if (u.socketId === socket.id) {
            global.onlineUsers.delete(uid);
            require('./supabase').from('players')
              .update({ last_seen_at: new Date().toISOString(), is_online: false })
              .eq('user_id', uid).then(()=>{}).catch(()=>{});
            break;
          }
        }
      });
    });
    app.set('io', ioInstance);
    global._ioInstance = ioInstance;

    // Weekly leaderboard reset cron - mỗi thứ 2 00:00 VN
    try {
      const { scheduleWeeklyReset, checkAndNotifyTop1Changes } = require('./services/leaderboardResetService');
      scheduleWeeklyReset(ioInstance);
      console.log('[CRON] Weekly leaderboard reset scheduled');
    console.log('[CRON] Top1 change detector: event-driven mode');
    } catch(e) { console.error('[CRON] Schedule failed:', e.message); }

    // Snake game removed

    /**
     * ============================================
     * EVENT BUS
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
     * HTTP SERVER
     * ============================================
     */

    server.listen(
      PORT,
      () => {

        logger.info(
          "Server booted successfully",
          {

            port:
              PORT,

            environment:
              process.env.NODE_ENV,

            realtime:
              true,

            websocket:
              true,

            payment:
              true,

            pid:
              process.pid,

          }
        );

        console.log(
          `🚀 Backend running on http://localhost:${PORT}`
        );

        console.log(
          `💳 Payment API: http://localhost:${PORT}/api/payment/test`
        );

        console.log(
          `❤️ Healthcheck: http://localhost:${PORT}/health`
        );

      }
    );

  } catch (
    error
  ) {

    logger.error(
      "startup error",
      {

        message:
          error.message,

        stack:
          error.stack,

      }
    );

    console.log(
      "❌ STARTUP FAILED:",
      error.message
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
  (
    reason
  ) => {

    logger.error(
      "UNHANDLED REJECTION",
      {
        reason,
      }
    );

    console.log(
      "❌ UNHANDLED REJECTION:",
      reason
    );

  }
);

process.on(
  "uncaughtException",
  (
    error
  ) => {

    logger.error(
      "UNCAUGHT EXCEPTION",
      {

        message:
          error.message,

        stack:
          error.stack,

      }
    );

    console.log(
      "❌ UNCAUGHT EXCEPTION:",
      error.message
    );

  }
);

/**
 * =====================================================
 * SHUTDOWN
 * =====================================================
 */

async function shutdown(
  signal
) {

  try {

    if (
      isShuttingDown
    ) {

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

    console.log(
      `🛑 Shutdown signal: ${signal}`
    );

    /**
     * ============================================
     * SOCKET CLOSE
     * ============================================
     */

    if (
      ioInstance
    ) {

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

        console.log(
          "✅ Server shutdown complete"
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

        console.log(
          "❌ Forced shutdown"
        );

        process.exit(1);

      },
      10000
    );

  } catch (
    error
  ) {

    logger.error(
      "shutdown error",
      {

        message:
          error.message,

        stack:
          error.stack,

      }
    );

    console.log(
      "❌ Shutdown error:",
      error.message
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
    shutdown(
      "SIGINT"
    )
);

process.on(
  "SIGTERM",
  () =>
    shutdown(
      "SIGTERM"
    )
);

/**
 * =====================================================
 * BOOT
 * =====================================================
 */

/**
 * =====================================================
 * 404 HANDLER
 * =====================================================
 */

app.use(
  (
    req,
    res
  ) => {

    return res
      .status(404)
      .json({

        success: false,

        code:
          "ROUTE_NOT_FOUND",

        message:
          "API route not found",

      });

  }
);

startServer();