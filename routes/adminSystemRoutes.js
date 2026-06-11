const express =
  require("express");

const router =
  express.Router();

const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "cing-admin-secret-2026";

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Token không hợp lệ" });
  }
}

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

  requireAdmin,

  getSystemState

);

/**
 * =====================================================
 * UPDATE RUNTIME
 * =====================================================
 */

router.patch(

  "/runtime",

  requireAdmin,

  updateSystemRuntime

);

/**
 * =====================================================
 * ENABLE FEATURE
 * =====================================================
 */

router.post(

  "/features/:feature/enable",

  requireAdmin,

  enableSystemFeature

);

/**
 * =====================================================
 * DISABLE FEATURE
 * =====================================================
 */

router.post(

  "/features/:feature/disable",

  requireAdmin,

  disableSystemFeature

);

/**
 * =====================================================
 * ENABLE MAINTENANCE
 * =====================================================
 */

router.post(

  "/maintenance/enable",

  requireAdmin,

  enableSystemMaintenance

);

/**
 * =====================================================
 * DISABLE MAINTENANCE
 * =====================================================
 */

router.post(

  "/maintenance/disable",

  requireAdmin,

  disableSystemMaintenance

);


/**
 * =====================================================
 * SYSTEM HEALTH
 * =====================================================
 */

router.get(
  "/health",
  requireAdmin,
  getSystemHealth
);

/**
 * =====================================================
 * CRM RECOVERY DASHBOARD
 * =====================================================
 */

router.get(
  "/crm-recovery/stats",
  requireAdmin,
  getCrmRecoveryStats
);

router.get(
  "/crm-recovery/jobs",
  requireAdmin,
  getCrmRecoveryJobs
);

router.post(
  "/crm-recovery/retry/:id",
  requireAdmin,
  retryCrmRecoveryJob
);

router.post(
  "/crm-recovery/retry-failed",
  requireAdmin,
  retryAllFailedCrmRecovery
);

router.post(
  "/crm-recovery/enqueue",
  requireAdmin,
  enqueueCrmRecoveryManual
);

router.post(
  "/crm-recovery/run",
  requireAdmin,
  runCrmRecoveryWorkerNow
);

router.post(
  "/crm-recovery/cleanup",
  requireAdmin,
  cleanupCrmRecoveryDone
);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;