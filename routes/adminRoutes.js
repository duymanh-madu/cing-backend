const express =
  require("express");

const router =
  express.Router();

/**
 * ============================================
 * ADMIN CORE
 * ============================================
 */

router.use(
  "/analytics",
  require("./adminAnalyticsRoutes")
);

router.use(
  "/controls",
  require("./adminControlRoutes")
);

router.use(
  "/realtime",
  require("./adminRealtimeRoutes")
);

router.use(
  "/roles",
  require("./adminRoleRoutes")
);

/**
 * ============================================
 * FUTURE ADMIN DOMAINS
 * ============================================
 */

router.use(
  "/vouchers",
  require("./voucherAdminRoutes")
);

router.use("/stats", require("./adminStatsRoutes"));
router.use("/players", require("./adminPlayerRoutes"));
router.use("/missions", require("./adminMissionRoutes"));
router.use("/cdp", require("./adminCdpRoutes"));
router.use("/leaderboard", require("./adminLeaderboardRoutes"));
router.use("/logs", require("./adminLogRoutes"));
module.exports =
  router;