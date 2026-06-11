const express =
  require("express");

const router =
  express.Router();

const {

  requirePermission,

} = require(
  "../middlewares/adminAuthMiddleware"
);

const {

  getSystemState,

  updateSystemRuntime,

  enableSystemFeature,

  disableSystemFeature,

  enableSystemMaintenance,

  disableSystemMaintenance,

} = require(
  "../controllers/admin/adminSystemController"
);

const {
  getSystemHealth,
  getCrmRecoveryStats,
  getCrmRecoveryJobs,
  retryCrmRecoveryJob,
  retryAllFailedCrmRecovery,
  enqueueCrmRecoveryManual,
  runCrmRecoveryWorkerNow,
  cleanupCrmRecoveryDone,
} = require(
  "../controllers/admin/adminSystemHealthController"
);

/**
 * =====================================================
 * SYSTEM STATE
 * =====================================================
 */

router.get(

  "/",

  requirePermission(
    "system.read"
  ),

  getSystemState

);

/**
 * =====================================================
 * UPDATE RUNTIME
 * =====================================================
 */

router.patch(

  "/runtime",

  requirePermission(
    "system.runtime.update"
  ),

  updateSystemRuntime

);

/**
 * =====================================================
 * ENABLE FEATURE
 * =====================================================
 */

router.post(

  "/features/:feature/enable",

  requirePermission(
    "system.feature.enable"
  ),

  enableSystemFeature

);

/**
 * =====================================================
 * DISABLE FEATURE
 * =====================================================
 */

router.post(

  "/features/:feature/disable",

  requirePermission(
    "system.feature.disable"
  ),

  disableSystemFeature

);

/**
 * =====================================================
 * ENABLE MAINTENANCE
 * =====================================================
 */

router.post(

  "/maintenance/enable",

  requirePermission(
    "system.maintenance.enable"
  ),

  enableSystemMaintenance

);

/**
 * =====================================================
 * DISABLE MAINTENANCE
 * =====================================================
 */

router.post(

  "/maintenance/disable",

  requirePermission(
    "system.maintenance.disable"
  ),

  disableSystemMaintenance

);


/**
 * =====================================================
 * SYSTEM HEALTH
 * =====================================================
 */

router.get(
  "/health",
  requirePermission("system.read"),
  getSystemHealth
);

/**
 * =====================================================
 * CRM RECOVERY DASHBOARD
 * =====================================================
 */

router.get(
  "/crm-recovery/stats",
  requirePermission("system.read"),
  getCrmRecoveryStats
);

router.get(
  "/crm-recovery/jobs",
  requirePermission("system.read"),
  getCrmRecoveryJobs
);

router.post(
  "/crm-recovery/retry/:id",
  requirePermission("system.runtime.update"),
  retryCrmRecoveryJob
);

router.post(
  "/crm-recovery/retry-failed",
  requirePermission("system.runtime.update"),
  retryAllFailedCrmRecovery
);

router.post(
  "/crm-recovery/enqueue",
  requirePermission("system.runtime.update"),
  enqueueCrmRecoveryManual
);

router.post(
  "/crm-recovery/run",
  requirePermission("system.runtime.update"),
  runCrmRecoveryWorkerNow
);

router.post(
  "/crm-recovery/cleanup",
  requirePermission("system.runtime.update"),
  cleanupCrmRecoveryDone
);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;