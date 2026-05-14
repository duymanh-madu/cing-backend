const express =
  require("express");

const router =
  express.Router();

/**
 * ============================================
 * PAYMENT WEBHOOKS
 * ============================================
 */

router.use(
  "/payments",
  require("./paymentWebhookRoutes")
);

/**
 * ============================================
 * FUTURE WEBHOOKS
 * ============================================
 */

/**
 * POS WEBHOOK
 * /webhook/ipos
 */

/**
 * CRM WEBHOOK
 * /webhook/crm
 */

/**
 * DELIVERY WEBHOOK
 * /webhook/delivery
 */

/**
 * AUTOMATION WEBHOOK
 * /webhook/automation
 */

module.exports =
  router;