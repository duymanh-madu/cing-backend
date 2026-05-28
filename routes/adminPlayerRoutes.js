const express  = require("express");
const router   = express.Router();
const jwt      = require("jsonwebtoken");
const supabase = require("../supabase");

const JWT_SECRET = process.env.JWT_SECRET || "cing-admin-secret-2026";

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ success: false, message: "Token không hợp lệ" }); }
}

// POST /admin/players/adjust-plays
router.post("/adjust-plays", requireAdmin, async (req, res) => {
  try {
    const { user_id, phone, amount } = req.body;
    const uid = user_id || phone;
    if (!uid || !amount) return res.status(400).json({ success: false, error: "Thiếu thông tin" });

    const { data: player } = await supabase
      .from("players").select("game_plays").eq("user_id", uid).single();

    const newPlays = Math.max(0, Number(player?.game_plays || 0) + Number(amount));
    const { error } = await supabase.from("players")
      .update({ game_plays: newPlays }).eq("user_id", uid);

    if (error) throw error;
    // Log analytics
    await supabase.from('analytics_events').insert({
      event_name: 'plays_adjusted',
      user_id: String(uid),
      event_data: { plays: Number(amount), new_total: newPlays, admin: req.admin?.username || 'admin' },
      created_at: new Date().toISOString()
    }).catch(()=>{});
    res.json({ success: true, message: `Đã điều chỉnh ${amount > 0 ? "+" : ""}${amount} lượt`, new_plays: newPlays });
  } catch (err) {
    console.error('[ADJUST-PLAYS ERROR]', err.message, err.stack);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/players/adjust-points
router.post("/adjust-points", requireAdmin, async (req, res) => {
  try {
    const { user_id, phone, amount, reason } = req.body;
    const uid = user_id || phone;
    if (!uid || !amount) return res.status(400).json({ success: false, error: "Thiếu thông tin" });

    const { deductPoints, addPoints } = require("../services/loyaltyPointService");
    if (amount < 0) {
      await deductPoints({ phone: uid, user_id: uid, points: Math.abs(amount), reason: reason || "Admin điều chỉnh" });
    } else {
      await addPoints({ phone: uid, user_id: uid, points: amount, reason: reason || "Admin tặng điểm" });
    }
    res.json({ success: true, message: `Đã điều chỉnh ${amount > 0 ? "+" : ""}${amount} điểm` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
