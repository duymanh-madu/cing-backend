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
router.use("/revive-credits", require("./adminReviveCreditRoutes"));


/*
 * CING_REVIVE_ADMIN_PRICE_PANEL_MOUNT_V1
 *
 * Existing Admin Panel authentication and permission.
 * Explicit Super Admin role is additionally required.
 *
 * Dedicated router retains its own default-OFF HTTP gate.
 * This mount does not enable any financial operation.
 */
{
  const {
    requirePanelPermission,
  } = require(
    "../middlewares/adminPanelPermissionMiddleware"
  );

  const {
    createCingReviveCreditAdminPriceRouter,
  } = require(
    "./cingReviveCreditAdminPriceRoutes"
  );

  const authMiddleware =
    requirePanelPermission(
      "revive.credit.adjust"
    );

  const requireSuperAdmin = (
    req,
    res,
    next
  ) => {
    if (
      req.admin?.role !==
      "super_admin"
    ) {
      return res.status(403).json({
        success: false,
        code:
          "REVIVE_ADMIN_SUPER_ADMIN_REQUIRED",
      });
    }

    return next();
  };

  const resolveAdminActor = req => {
    const id =
      req.admin?.id;

    if (
      id === undefined ||
      id === null
    ) {
      return null;
    }

    const actor =
      String(id).trim();

    return (
      actor.length > 0 &&
      actor.length <= 128
    )
      ? actor
      : null;
  };

  router.use(
    "/game-economy/revive",
    createCingReviveCreditAdminPriceRouter({
      authMiddleware,
      requireSuperAdmin,
      resolveAdminActor,
    })
  );
}



/*
 * CING_GAME_GIFT_CATALOG_ADMIN_PANEL_MOUNT_V1
 *
 * Admin Panel JWT -> active Admin DB authority ->
 * dedicated Gift permission -> explicit Super Admin.
 *
 * This mount does not activate Gift Admin HTTP.
 * The Gift router retains its default-OFF gate.
 */
{
  const {
    requirePanelPermission,
  } = require(
    "../middlewares/adminPanelPermissionMiddleware"
  );

  const {
    createCingGameGiftCatalogAdminRouter,
  } = require(
    "./cingGameGiftCatalogAdminRoutes"
  );

  const authMiddleware =
    requirePanelPermission(
      "gift.catalog.manage"
    );

  const requireSuperAdmin = (
    req,
    res,
    next
  ) => {
    if (
      req.admin?.role !==
      "super_admin"
    ) {
      return res.status(403).json({
        success: false,
        code:
          "GAME_GIFT_SUPER_ADMIN_REQUIRED",
      });
    }

    return next();
  };

  const resolveAdminActor = req => {
    const id =
      req.admin?.id;

    if (
      id === undefined ||
      id === null
    ) {
      return null;
    }

    const actor =
      String(id).trim();

    return (
      actor.length > 0 &&
      actor.length <= 128
    )
      ? actor
      : null;
  };

  router.use(
    "/game-economy/gifts",
    createCingGameGiftCatalogAdminRouter({
      authMiddleware,
      requireSuperAdmin,
      resolveAdminActor,
    })
  );
}

router.use("/missions", require("./adminMissionRoutes"));
router.use("/cdp", require("./adminCdpRoutes"));
router.use("/leaderboard", require("./adminLeaderboardRoutes"));
router.use("/logs", require("./adminLogRoutes"));
module.exports =
  router;
// POST /admin/broadcast — Flash Sale broadcast tới toàn bộ client
const jwt = require("jsonwebtoken");
const {
  JWT_SECRET,
} = require(
  "../utils/jwtSecretAuthority"
);
router.post("/broadcast", (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ success: false, message: "Token không hợp lệ" }); }
}, async (req, res) => {
  try {
    const { title, message, type = "flash_sale" } = req.body;
    if (!title || !message) return res.status(400).json({ success: false, message: "Thiếu title hoặc message" });
    const { realtimeEventBus } = require("../services/realtime/realtimeEventBus");
    realtimeEventBus.publish({
      event: "notification.broadcast",
      delivery_type: "BROADCAST",
      payload: { title, message, type, timestamp: Date.now() },
      channel: "notification",
      timestamp: new Date().toISOString(),
    });
    res.json({ success: true, message: "Đã broadcast đến tất cả người dùng online" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
