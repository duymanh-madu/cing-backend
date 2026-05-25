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

  getPaymentProvidersHealth,

  retryFailedPayment,

  getAuditLogs,

} = require(
  "../controllers/admin/adminPaymentController"
);

/**
 * =====================================================
 * ADMIN PERMISSION
 * =====================================================
 */

router.use(
  requirePermission(
    "payment.manage"
  )
);

/**
 * =====================================================
 * PAYMENT PROVIDER HEALTH
 * =====================================================
 */

router.get(
  "/providers/health",
  getPaymentProvidersHealth
);

/**
 * =====================================================
 * RETRY FAILED PAYMENT
 * =====================================================
 */

router.post(
  "/retry",
  retryFailedPayment
);

/**
 * =====================================================
 * AUDIT LOGS
 * =====================================================
 */

router.get(
  "/audit-logs",
  getAuditLogs
);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;