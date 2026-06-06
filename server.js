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
      
      // Tự động track user:online từ heartbeat
      socket.on('runtime:heartbeat', ({ userId, timestamp }) => {
        if (!userId) return;
        const existing = global.onlineUsers.get(String(userId));
        if (existing) {
          existing.lastSeen = new Date().toISOString();
          global.onlineUsers.set(String(userId), existing);
        }
      });

      // Community chat qua main namespace
      socket.on('community:join', async ({ userId, name, avatar, tierKey }) => {
        if (!userId) return;
        // Lấy charm_points từ DB
        let charmPoints = 0;
        try {
          const { data } = await supabase.from('players').select('charm_points').eq('user_id', userId).single();
          charmPoints = Number(data?.charm_points || 0);
        } catch(e) {}
        socket.data = { ...socket.data, communityUserId: userId, communityName: name, communityAvatar: avatar, communityTierKey: tierKey, charmPoints };
        socket.broadcast.emit('community:user_joined', { userId, name, avatar, tierKey, charmPoints });
        // Danh sách user online
        const users = [];
        for (const [, s] of ioInstance.sockets.sockets) {
          if (s.data?.communityUserId) users.push({
            userId: s.data.communityUserId, name: s.data.communityName,
            avatar: s.data.communityAvatar, tierKey: s.data.communityTierKey,
            charmPoints: s.data.charmPoints || 0,
          });
        }
        socket.emit('community:users', users);
        try {
          const rc = require('./services/infrastructure/cache/redisClient');
          const history = await rc.lrange('community:chat:history', 0, 49);
          socket.emit('community:history', history.map(m => JSON.parse(m)).reverse());
        } catch(e) {}
      });

      socket.on('community:chat', async ({ userId, name, avatar, message, tierKey }) => {
        if (!message?.trim()) return;
        // Lấy charm_points realtime
        let charmPoints = socket.data?.charmPoints || 0;
        try {
          const { data } = await supabase.from('players').select('charm_points').eq('user_id', userId).maybeSingle();
          charmPoints = Number(data?.charm_points || 0);
          socket.data.charmPoints = charmPoints;
        } catch(e) {}
        const msg = { userId, name, avatar, message: message.trim().slice(0,200), timestamp: Date.now(), tierKey, charmPoints };
        ioInstance.emit('community:chat', msg);
        try {
          const rc = require('./services/infrastructure/cache/redisClient');
          await rc.lpush('community:chat:history', JSON.stringify(msg));
          await rc.ltrim('community:chat:history', 0, 99);
          await rc.expire('community:chat:history', 86400);
        } catch(e) {}
      });

      socket.on('community:voice_start', ({ userId }) => {
        socket.broadcast.emit('community:voice_start', { userId });
      });

      socket.on('community:voice_end', ({ userId }) => {
        socket.broadcast.emit('community:voice_end', { userId });
      });

      socket.on('community:signal', ({ userId, signal }) => {
        socket.broadcast.emit('community:signal', { userId, signal });
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

      // Track game hiện tại của user
      socket.on('user:game', ({ userId, game, action }) => {
        if (!userId) return;
        const u = global.onlineUsers.get(String(userId));
        if (u) {
          if (action === 'start') {
            u.currentGame = game || '';
            u.gameStartedAt = new Date().toISOString();
          } else if (action === 'stop') {
            u.currentGame = '';
            u.gameStartedAt = null;
          }
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

      // CRM sync 30p đã bỏ — dùng webhook iPOS realtime + daily cron 23h20 thay thế
    console.log('[CRON] Top1 change detector: event-driven mode');
    } catch(e) { console.error('[CRON] Schedule failed:', e.message); }

    // Snake game removed

    /**
     * ============================================
     * COMMUNITY CHAT NAMESPACE
     * ============================================
     */
    const communityNs = ioInstance.of('/community');
    let voiceSpeaker = null;

    communityNs.on('connection', (socket) => {
      socket.on('community:join', async ({ userId, name, avatar }) => {
        if (!userId) return;
        socket.data = { userId, name, avatar };
        socket.broadcast.emit('community:user_joined', { userId, name, avatar });
        const users = [...communityNs.sockets.values()].map(s => s.data).filter(d => d?.userId);
        socket.emit('community:users', users);
        if (voiceSpeaker) socket.emit('community:voice_start', { userId: voiceSpeaker });
        // Load lịch sử chat từ Redis
        try {
          const redisClient = require('./services/infrastructure/cache/redisClient');
          const history = await redisClient.lrange('community:chat:history', 0, 49);
          const messages = history.map(m => JSON.parse(m)).reverse();
          socket.emit('community:history', messages);
        } catch(e) { console.warn('[COMMUNITY] Redis history error:', e.message); }
      });

      socket.on('community:chat', async ({ userId, name, avatar, message }) => {
        if (!message?.trim()) return;
        const msg = { userId, name, avatar, message: message.trim().slice(0,200), timestamp: Date.now() };
        communityNs.emit('community:chat', msg);
        // Lưu vào Redis — giữ 100 tin nhắn gần nhất, TTL 24h
        try {
          const redisClient = require('./services/infrastructure/cache/redisClient');
          await redisClient.lpush('community:chat:history', JSON.stringify(msg));
          await redisClient.ltrim('community:chat:history', 0, 99);
          await redisClient.expire('community:chat:history', 86400); // 24h
        } catch(e) { console.warn('[COMMUNITY] Redis save error:', e.message); }
      });

      socket.on('community:voice_start', ({ userId }) => {
        if (voiceSpeaker && voiceSpeaker !== userId) return;
        voiceSpeaker = userId;
        communityNs.emit('community:voice_start', { userId });
      });

      socket.on('community:signal', ({ userId, signal }) => {
        socket.broadcast.emit('community:signal', { userId, signal });
      });

      socket.on('community:voice_end', ({ userId }) => {
        if (voiceSpeaker === userId) {
          voiceSpeaker = null;
          communityNs.emit('community:voice_end', { userId });
        }
      });

      socket.on('disconnect', () => {
        const { userId } = socket.data || {};
        if (!userId) return;
        communityNs.emit('community:user_left', { userId });
        if (voiceSpeaker === userId) {
          voiceSpeaker = null;
          communityNs.emit('community:voice_end', { userId });
        }
      });
    });

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