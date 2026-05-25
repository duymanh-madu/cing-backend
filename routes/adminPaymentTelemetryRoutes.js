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

  getPaymentTelemetry,

} = require(
  "../controllers/admin/adminPaymentTelemetryController"
);

/**
 * =====================================================
 * PAYMENT TELEMETRY
 * =====================================================
 */

router.get(

  "/",

  requirePermission(
    "payment.telemetry.read"
  ),

  getPaymentTelemetry

);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;