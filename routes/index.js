const express =
  require("express");

const router =
  express.Router();

/**
 * =====================================================
 * PUBLIC APIs
 * =====================================================
 */

router.use("/obs", require("./observability"));

router.use(
  "/admin/governance",
  require("./adminGovernanceRoutes")
);

router.use(
  "/admin/system",
  require("./adminSystemRoutes")
);

router.use(
  "/admin/payment-telemetry",
  require("./adminPaymentTelemetryRoutes")
);

router.use(
  "/admin/payment-provider",
  require("./adminPaymentProviderRoutes")
);

router.use(
  "/admin/payment-queues",
  require("./adminPaymentQueueRoutes")
);

router.use(
  "/auth",
  require("./authRoutes")
);

router.use(
  "/customer",
  require("./customerRoutes")
);

router.use(
  "/cms",
  require("./cmsRoutes")
);

router.use(
  "/runtime",
  require("./runtimeRoutes")
);

router.use(
  "/profile",
  require("./profileRoutes")
);

router.use(
  "/member",
  require("./memberRoutes")
);

router.use(
  "/menu",
  require("./menuRoutes")
);

router.use(
  "/voucher",
  require("./voucherRoutes")
);

router.use(
  "/game",
  require("./gameRoutes")
);

router.use(
  "/wheel",
  require("./wheelRoutes")
);

router.use(
  "/levels",
  require("./levelRoutes")
);

router.use(
  "/leaderboard",
  require("./leaderboardRoutes")
);
router.use(
  "/membership",
  require("./membershipRoutes")
);
router.use(
  "/missions",
  require("./dailyMissionRoutes")
);


/**
 * =====================================================
 * COMMERCE APIs
 * =====================================================
 */

router.use(
  "/checkout",
  require("./checkoutRoutes")
);

router.use(
  "/orders",
  require("./orderRoutes")
);

router.use(
  "/shipping",
  require("./shippingRoutes")
);

router.use(
  "/payments",
  require("./paymentRoutes")
);

router.use(
  "/payment",
  require("./paymentRoutes")
);

router.use(
  "/payment/webhook",
  require("./paymentWebhookRoutes")
);

router.use(
  "/order-status",
  require("./orderStatusRoutes")
);

router.use(
  "/delivery-tracking",
  require("./deliveryTrackingRoutes")
);

/**
 * =====================================================
 * NOTIFICATION APIs
 * =====================================================
 */

router.use(
  "/notifications",
  require("./notificationRoutes")
);

/**
 * =====================================================
 * CAMPAIGN APIs
 * =====================================================
 */

router.use(
  "/campaign",
  require("./campaignRoutes")
);

/**
 * =====================================================
 * STORAGE APIs
 * =====================================================
 */

router.use(
  "/upload",
  require("./uploadRoutes")
);

/**
 * =====================================================
 * APP SYSTEM APIs
 * =====================================================
 */

router.use(
  "/app",
  require("./appRoutes")
);

router.use(
  "/app-config",
  require("./appConfigRoutes")
);

/**
 * =====================================================
 * ADMIN APIs
 * =====================================================
 */

router.use(
  "/admin",
  require("./adminRoutes")
);

router.use(
  "/admin/realtime",
  require("./adminRealtimeRoutes")
);

router.use(
  "/admin/analytics",
  require("./adminAnalyticsRoutes")
);

router.use(
  "/admin/controls",
  require("./adminControlRoutes")
);

router.use(
  "/admin/roles",
  require("./adminRoleRoutes")
);

router.use(
  "/admin/payments",
  require("./adminPaymentRoutes")
);

router.use(
  "/admin/payment-failures",
  require("./adminPaymentFailureRoutes")
);

router.use(
  "/admin/payment-audit",
  require("./adminPaymentAuditRoutes")
);

/**
 * =====================================================
 * WEBHOOK APIs
 * =====================================================
 */

router.use(
  "/integrations/webhook",
  require("./webhookRoutes")
);

/**
 * =====================================================
 * INTERNAL APIs
 * =====================================================
 */

router.use(
  "/internal",
  require("./internalRoutes")
);

router.use(
  "/internal/payment",
  require("./internalPaymentRoutes")
);

/**
 * =====================================================
 * CRM APIs
 * =====================================================
 */

router.use(
  "/crm",
  require("./crmRoutes")
);

/**
 * =====================================================
 * AUTOMATION APIs
 * =====================================================
 */

router.use(
  "/automation",
  require("./automationRoutes")
);

router.use(
  "/activation",
  require("./activationRoutes")
);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;