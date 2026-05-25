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
  getPaymentAuditLogs,
} = require(
  "../controllers/admin/adminPaymentAuditController"
);

/**
 * =====================================================
 * ADMIN PERMISSION
 * =====================================================
 */

router.use(
  requirePermission(
    "payment.audit"
  )
);

/**
 * =====================================================
 * PAYMENT AUDIT LOGS
 * =====================================================
 */

router.get(
  "/",
  getPaymentAuditLogs
);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;