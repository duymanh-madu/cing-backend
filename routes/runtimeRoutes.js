const express =
  require("express");

const router =
  express.Router();

const {
  getRuntimeConfig,
  getRuntimeFeatures,
  getRuntimeVersion,
  getRuntimeMetrics,
  getSocketHealth,
} = require(
  "../controllers/runtime/runtimeController"
);

/**
 * =====================================================
 * RUNTIME CONFIG
 * =====================================================
 */

router.get(
  "/config",
  getRuntimeConfig
);

/**
 * =====================================================
 * FEATURE FLAGS
 * =====================================================
 */

router.get(
  "/features",
  getRuntimeFeatures
);

/**
 * =====================================================
 * VERSION
 * =====================================================
 */

router.get(
  "/version",
  getRuntimeVersion
);

/**
 * =====================================================
 * METRICS
 * =====================================================
 */

router.get(
  "/metrics",
  getRuntimeMetrics
);

/**
 * =====================================================
 * SOCKET HEALTH
 * =====================================================
 */

router.get(
  "/socket-health",
  getSocketHealth
);

module.exports =
  router;