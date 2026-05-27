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

router.get("/", requireAdmin, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [players, ordersToday, gamesTotal, paymentsToday] = await Promise.all([
      supabase.from("players").select("id", { count:"exact", head:true }),
      supabase.from("orders").select("id", { count:"exact", head:true }).gte("created_at", today.toISOString()),
      supabase.from("game_scores").select("id", { count:"exact", head:true }),
      supabase.from("payment_transactions").select("amount").eq("payment_status", "paid").gte("created_at", today.toISOString()),
    ]);

    const revenueToday = (paymentsToday.data || []).reduce((s, p) => s + Number(p.amount || 0), 0);

    res.json({
      success: true,
      data: {
        total_players:  players.count || 0,
        orders_today:   ordersToday.count || 0,
        games_total:    gamesTotal.count || 0,
        revenue_today:  revenueToday,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
