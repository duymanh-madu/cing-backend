const express =
  require("express");

const router =
  express.Router();

/**
 * =====================================================
 * PUBLIC APIs
 * =====================================================
 */

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
  "/auth",
  require("./authRoutes")
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
  "/payments",
  require("./paymentRoutes")
);

router.use(
  "/shipping",
  require("./shippingRoutes")
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

/**
 * =====================================================
 * INTERNAL APIs
 * =====================================================
 */

router.use(
  "/internal",
  require("./internalRoutes")
);


/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;