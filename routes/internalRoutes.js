const express =
  require("express");

const router =
  express.Router();

/**
 * =====================================================
 * CONTROLLERS
 * =====================================================
 */

const internalHealthController =
  require(
    "../controllers/internal/internalHealthController"
  );

const queueStatsController =
  require(
    "../controllers/internal/queueStatsController"
  );

const socketStatsController =
  require(
    "../controllers/internal/socketStatsController"
  );

/**
 * =====================================================
 * INTERNAL HEALTH
 * =====================================================
 */

router.get(
  "/health",
  internalHealthController
);

/**
 * =====================================================
 * QUEUE STATS
 * =====================================================
 */

router.get(
  "/queue/stats",
  queueStatsController
);

/**
 * =====================================================
 * SOCKET STATS
 * =====================================================
 */

router.get(
  "/socket/stats",
  socketStatsController
);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;