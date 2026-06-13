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

router.use("/stats", require("./adminStatsRoutes"));
router.use("/players", require("./adminPlayerRoutes"));
router.use("/missions", require("./adminMissionRoutes"));
router.use("/cdp", require("./adminCdpRoutes"));
router.use("/leaderboard", require("./adminLeaderboardRoutes"));
router.use("/logs", require("./adminLogRoutes"));
module.exports =
  router;
// POST /admin/broadcast — Flash Sale broadcast tới toàn bộ client
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "cing-admin-secret-2026";
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
