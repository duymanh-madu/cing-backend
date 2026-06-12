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


// GET /admin/players/search?q=...
router.get("/search", requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ success:false, message:"Thiếu từ khóa tìm kiếm" });

    const digits = q.replace(/\D/g, "");
    const qLower = q.toLowerCase();

    let query = supabase
      .from("players")
      .select("user_id, phone, phone_number, display_name, zalo_name, avatar, zalo_avatar, crm_tier, total_points, crm_spend_alltime")
      .limit(20);

    if (digits.length >= 6) {
      query = query.or(`user_id.ilike.%${digits}%,phone.ilike.%${digits}%,phone_number.ilike.%${digits}%`);
    } else {
      query = query.or(`display_name.ilike.%${qLower}%,zalo_name.ilike.%${qLower}%,user_id.ilike.%${qLower}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) {
      return res.status(404).json({ success:false, message:"Không tìm thấy người chơi" });
    }

    const p = rows[0];

    res.json({
      success: true,
      data: {
        user_id: p.user_id,
        phone: p.phone || p.phone_number || p.user_id,
        display_name: p.display_name || "",
        zalo_name: p.zalo_name || "",
        name: p.display_name || p.zalo_name || p.user_id,
        avatar: p.avatar || p.zalo_avatar || "",
        tierKey: p.crm_tier || "member",
        tierName: p.crm_tier || "member",
        points: p.total_points || 0,
        paymentAmount: p.crm_spend_alltime || 0,
        matches: rows.map(x => ({
          user_id: x.user_id,
          phone: x.phone || x.phone_number || x.user_id,
          display_name: x.display_name || "",
          zalo_name: x.zalo_name || "",
          name: x.display_name || x.zalo_name || x.user_id,
        })),
      },
    });
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
});


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
    try {
      await supabase.from('analytics_events').insert({
        event_name: 'plays_adjusted',
        user_id: String(uid),
        event_data: { plays: Number(amount), new_total: newPlays, admin: req.admin?.username || 'admin' },
        created_at: new Date().toISOString()
      });
    } catch(e) {}
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
