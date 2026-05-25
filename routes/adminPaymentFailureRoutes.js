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
  getPaymentFailures,
} = require(
  "../controllers/admin/adminPaymentFailureController"
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
 * PAYMENT FAILURES
 * =====================================================
 */

router.get(
  "/",
  getPaymentFailures
);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;