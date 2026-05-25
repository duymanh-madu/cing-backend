const express = require("express");
const router = express.Router();
const { verifyAdmin } = require("./adminAuthRoutes");
const supabase = require("../supabase");
const redisClient = require("../services/infrastructure/cache/redisClient");

// Config missions luu trong Redis (thay doi realtime)
const MISSIONS_CONFIG_KEY = "admin:missions:config";

const DEFAULT_MISSIONS = [
  { type: "checkin",    label: "Điểm danh hàng ngày",     plays: 3,  enabled: true, icon: "📅" },
  { type: "order_100k", label: "Đặt hàng từ 100.000đ",    plays: 2,  enabled: true, icon: "🧋" },
  { type: "order_500k", label: "Đặt hàng từ 500.000đ",    plays: 10, enabled: true, icon: "🎯" },
];

// GET missions config
router.get("/missions", verifyAdmin, async (req, res) => {
  try {
    const cached = await redisClient.get(MISSIONS_CONFIG_KEY);
    const config = cached ? JSON.parse(cached) : DEFAULT_MISSIONS;
    res.json({ success: true, data: config });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT missions config - cap nhat realtime
router.put("/missions", verifyAdmin, async (req, res) => {
  try {
    const { missions } = req.body;
    if (!Array.isArray(missions))
      return res.status(400).json({ success: false, message: "missions must be array" });

    await redisClient.set(MISSIONS_CONFIG_KEY, JSON.stringify(missions));

    // Push realtime den tat ca clients
    const { realtimeEventBus } = require("../services/realtime/realtimeEventBus");
    realtimeEventBus.publish({
      event: "missions.config.updated",
      delivery_type: "BROADCAST",
      payload: { missions },
      channel: "admin",
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, message: "Cập nhật thành công", data: missions });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET stats - tong quan
router.get("/stats", verifyAdmin, async (req, res) => {
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const [players, orders, checkins] = await Promise.all([
      supabase.from("players").select("id", { count: "exact" }),
      supabase.from("orders").select("id", { count: "exact" }).gte("created_at", today),
      supabase.from("daily_missions").select("id", { count: "exact" })
        .eq("mission_date", today).eq("mission_type", "checkin").eq("completed", true),
    ]);
    res.json({
      success: true,
      data: {
        total_players: players.count || 0,
        orders_today: orders.count || 0,
        checkins_today: checkins.count || 0,
      }
    });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

// POST /api/admin/broadcast - gui thong bao flash sales
router.post("/broadcast", verifyAdmin, async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title) return res.status(400).json({ success: false, message: "Thiếu title" });
    
    const { broadcastNotification } = require("../services/notificationService");
    await broadcastNotification({
      template_key: "CAMPAIGN_BROADCAST",
      custom: { title, message: message || "" }
    });
    
    res.json({ success: true, message: "Đã gửi thông báo đến tất cả người dùng" });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
