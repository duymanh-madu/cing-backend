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
  getIposRecoveryStats,
  getIposRecoveryJobs,
  retryIposRecoveryJob,
  retryAllFailedIposRecovery,
  runIposRecoveryWorkerNow,
  getNotificationRecoveryStats,
  getNotificationRecoveryJobs,
  getNotificationDeadJobs,
  retryNotificationJob,
  retryAllFailedNotificationJobs,
  releaseStuckNotificationRecovery,
  cleanupCompletedNotificationJobs,
  getTransactionIntegrityHealth,
  runTransactionIntegrityNow,
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
 * IPOS RECOVERY DASHBOARD
 * =====================================================
 */

router.get(
  "/ipos-recovery/stats",
  requireAdmin,
  getIposRecoveryStats
);

router.get(
  "/ipos-recovery/jobs",
  requireAdmin,
  getIposRecoveryJobs
);

router.post(
  "/ipos-recovery/retry/:id",
  requireAdmin,
  retryIposRecoveryJob
);

router.post(
  "/ipos-recovery/retry-failed",
  requireAdmin,
  retryAllFailedIposRecovery
);

router.post(
  "/ipos-recovery/run",
  requireAdmin,
  runIposRecoveryWorkerNow
);


/**
 * =====================================================
 * NOTIFICATION RECOVERY DASHBOARD
 * =====================================================
 */

router.get(
  "/notification-recovery/stats",
  requireAdmin,
  getNotificationRecoveryStats
);

router.get(
  "/notification-recovery/jobs",
  requireAdmin,
  getNotificationRecoveryJobs
);

router.get(
  "/notification-recovery/dead-jobs",
  requireAdmin,
  getNotificationDeadJobs
);

router.post(
  "/notification-recovery/retry/:id",
  requireAdmin,
  retryNotificationJob
);

router.post(
  "/notification-recovery/retry-failed",
  requireAdmin,
  retryAllFailedNotificationJobs
);

router.post(
  "/notification-recovery/release-stuck",
  requireAdmin,
  releaseStuckNotificationRecovery
);

router.post(
  "/notification-recovery/cleanup",
  requireAdmin,
  cleanupCompletedNotificationJobs
);


/**
 * =====================================================
 * TRANSACTION INTEGRITY HEALTH
 * =====================================================
 */

router.get(
  "/transaction-integrity",
  requireAdmin,
  getTransactionIntegrityHealth
);

router.get(
  "/loyalty-integrity",
  requireAdmin,
  getLoyaltyIntegrityHealth
);

router.post(
  "/transaction-integrity/run",
  requireAdmin,
  runTransactionIntegrityNow
);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;