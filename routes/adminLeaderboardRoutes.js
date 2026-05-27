const express  = require("express");
const router   = express.Router();
const jwt      = require("jsonwebtoken");
const supabase = require("../supabase");
const { addPoints } = require("../services/loyaltyPointService");

const JWT_SECRET = process.env.JWT_SECRET || "cing-admin-secret-2026";

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ success: false, message: "Token không hợp lệ" }); }
}

// GET /admin/leaderboard/config
router.get("/config", requireAdmin, async (req, res) => {
  try {
    const { data } = await supabase.from("app_configs")
      .select("leaderboard_config").eq("id", 1).single();
    res.json({ success: true, data: data?.leaderboard_config || {} });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /admin/leaderboard/config
router.put("/config", requireAdmin, async (req, res) => {
  try {
    const { leaderboard_config } = req.body;
    const { error } = await supabase.from("app_configs")
      .update({ leaderboard_config }).eq("id", 1);
    if (error) throw error;
    res.json({ success: true, message: "Đã lưu cấu hình bảng xếp hạng" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/leaderboard/distribute-rewards
// Phát thưởng cho top players của 1 period/game
router.post("/distribute-rewards", requireAdmin, async (req, res) => {
  try {
    const { type, period, game_key } = req.body;
    // type = "spending" | "game"

    const { data: configRow } = await supabase.from("app_configs")
      .select("leaderboard_config").eq("id", 1).single();
    const config = configRow?.leaderboard_config || {};

    let rewards = [];
    let topPlayers = [];

    if (type === "spending") {
      const periodConfig = config.spending?.[period];
      if (!periodConfig?.enabled) return res.status(400).json({ success: false, error: "Period không được bật" });
      rewards = periodConfig.rewards || [];

      const col = { weekly:"crm_spend_weekly", monthly:"crm_spend_monthly",
        quarterly:"crm_spend_quarterly", alltime:"crm_spend_alltime" }[period] || "crm_spend_alltime";

      const { data } = await supabase.from("players")
        .select("user_id, zalo_name").gt(col, 0)
        .order(col, { ascending: false }).limit(3);
      topPlayers = data || [];
    }

    if (type === "game") {
      const gameConfig = config.games?.[game_key];
      if (!gameConfig?.enabled) return res.status(400).json({ success: false, error: "Game không được bật" });
      rewards = gameConfig.rewards || [];

      const { data } = await supabase.from("game_scores")
        .select("user_id, player_name, score").eq("game_key", game_key)
        .order("score", { ascending: false }).limit(3);
      topPlayers = data || [];
    }

    // Phát thưởng
    const results = [];
    for (let i = 0; i < Math.min(rewards.length, topPlayers.length); i++) {
      const player = topPlayers[i];
      const reward = rewards[i];
      if (!reward?.points || reward.points <= 0) continue;

      await addPoints({
        user_id: player.user_id,
        phone:   player.user_id,
        points:  reward.points,
        reason:  `Phần thưởng top ${reward.rank} bảng xếp hạng ${type === "game" ? game_key : period}`,
      });

      // Lưu lịch sử phát thưởng
      await supabase.from("notifications").insert({
        user_id: player.user_id,
        type:    "reward",
        title:   `🏆 Phần thưởng Top ${reward.rank}!`,
        message: `Bạn đạt Top ${reward.rank} bảng xếp hạng và nhận được ${reward.points} điểm thưởng!`,
        data:    { type, period, game_key, rank: reward.rank, points: reward.points },
        read:    false,
      });

      results.push({ rank: reward.rank, user_id: player.user_id,
        name: player.zalo_name || player.player_name, points: reward.points });
    }

    res.json({ success: true, message: `Đã phát thưởng cho ${results.length} người`, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/leaderboard/reset-game-scores
// Reset bảng xếp hạng game theo tuần
router.post("/reset-game-scores", requireAdmin, async (req, res) => {
  try {
    const { game_key } = req.body;

    // Backup top 100 trước khi reset
    const { data: top100 } = await supabase.from("game_scores")
      .select("*").eq("game_key", game_key)
      .order("score", { ascending: false }).limit(100);

    // Lưu backup
    await supabase.from("game_score_archives").insert({
      game_key,
      week_start: getMonday(),
      top_scores: top100 || [],
      archived_at: new Date().toISOString(),
    }).catch(() => {}); // ignore nếu chưa có bảng

    // Reset scores
    const { error } = await supabase.from("game_scores")
      .delete().eq("game_key", game_key);

    if (error) throw error;
    res.json({ success: true, message: `Đã reset bảng xếp hạng ${game_key}`, archived: top100?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function getMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

module.exports = router;
