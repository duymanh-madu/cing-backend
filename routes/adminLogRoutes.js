const express  = require("express");
const router   = express.Router();
const jwt      = require("jsonwebtoken");
const supabase = require("../supabase");

const JWT_SECRET = process.env.JWT_SECRET || "cing-admin-secret-2026";

// Middleware verify JWT
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: "Token không hợp lệ" });
  }
}

/**
 * GET /admin/logs
 * Query: type=all|orders|games|points|payments, limit=50, page=1
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const { type = "all", limit = 50, page = 1 } = req.query;
    const lim = Number(limit);
    const off = (Number(page) - 1) * lim;

    const [orders, games, payments, analytics] = await Promise.all([
      (type === "all" || type === "orders")
        ? supabase.from("orders")
            .select("id,order_code,customer_name,customer_phone,total_amount,status,payment_method,payment_status,created_at,items")
            .order("created_at", { ascending: false }).limit(lim)
        : { data: [] },

      (type === "all" || type === "games")
        ? supabase.from("game_scores")
            .select("id,user_id,player_name,game_key,score,created_at")
            .order("created_at", { ascending: false }).limit(lim)
        : { data: [] },

      (type === "all" || type === "payments")
        ? supabase.from("payment_transactions")
            .select("id,transaction_code,user_id,customer_name,amount,payment_status,payment_method,created_at,callback_received")
            .order("created_at", { ascending: false }).limit(lim)
        : { data: [] },

      (type === "all" || type === "points")
        ? supabase.from("analytics_events")
            .select("id,event_name,user_id,event_data,created_at")
            .order("created_at", { ascending: false }).limit(lim)
        : { data: [] },
    ]);

    const allLogs = [
      ...(orders.data   || []).map(o => ({ ...o, _type:"order"    })),
      ...(games.data    || []).map(g => ({ ...g, _type:"game"     })),
      ...(payments.data || []).map(p => ({ ...p, _type:"payment"  })),
      ...(analytics.data|| []).map(a => ({ ...a, _type:"analytics"})),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
     .slice(off, off + lim);

    res.json({ success: true, data: allLogs, page: Number(page), limit: lim });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
