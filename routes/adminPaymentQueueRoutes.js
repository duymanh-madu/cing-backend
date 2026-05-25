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

  getPaymentQueues,

  getPaymentPressure,

} = require(
  "../controllers/admin/adminPaymentQueueController"
);

/**
 * =====================================================
 * PAYMENT QUEUES
 * =====================================================
 */

router.get(

  "/",

  requirePermission(
    "payment.queue.read"
  ),

  getPaymentQueues

);

/**
 * =====================================================
 * PAYMENT PRESSURE
 * =====================================================
 */

router.get(

  "/pressure",

  requirePermission(
    "payment.queue.pressure"
  ),

  getPaymentPressure

);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;