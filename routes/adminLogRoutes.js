const express  = require("express");
const router   = express.Router();
const jwt      = require("jsonwebtoken");
const supabase = require("../supabase");
const JWT_SECRET = process.env.JWT_SECRET || "cing-admin-secret-2026";

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success:false, message:"Unauthorized" });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ success:false, message:"Token không hợp lệ" }); }
}

router.get("/", requireAdmin, async (req, res) => {
  try {
    const { filter="all", limit=50, page=1, search="" } = req.query;
    const lim = Math.min(Number(limit), 100);
    const off = (Number(page)-1) * lim;
    const needAll     = filter === "all";

    // Helper search filter
    const addSearch = (q, cols) => {
      if (!search) return q;
      // Supabase không hỗ trợ OR trên nhiều columns dễ dàng
      // Dùng ilike trên column đầu tiên
      return q.ilike(cols[0], `%${search}%`);
    };

    const [orders, games, payments, points, playsBought, playsEarned, playsGiven, profileChanges] = await Promise.all([
      // Orders
      (needAll || filter==="orders")
        ? supabase.from("orders")
            .select("id,order_code,customer_name,customer_phone,total_amount,status,payment_method,created_at")
            .order("created_at",{ascending:false}).limit(lim)
        : {data:[]},

      // Game scores
      (needAll || filter==="games")
        ? supabase.from("game_scores")
            .select("id,user_id,player_name,game_key,score,kills,played_at")
            .order("played_at",{ascending:false}).limit(lim)
        : {data:[]},

      // Payments
      (needAll || filter==="payments")
        ? supabase.from("payment_transactions")
            .select("id,transaction_code,user_id,customer_name,amount,payment_status,payment_method,created_at")
            .order("created_at",{ascending:false}).limit(lim)
        : {data:[]},

      // Points history - từ analytics_events
      (needAll || filter==="points")
        ? supabase.from("analytics_events")
            .select("id,event_name,user_id,event_data,created_at")
            .in("event_name",["points_added","points_deducted","points_earned"])
            .order("created_at",{ascending:false}).limit(lim)
        : {data:[]},

      // Plays bought - từ analytics_events
      (needAll || filter==="plays_bought")
        ? supabase.from("analytics_events")
            .select("id,event_name,user_id,event_data,created_at")
            .eq("event_name","plays_purchased")
            .order("created_at",{ascending:false}).limit(lim)
        : {data:[]},

      // Plays earned from orders
      (needAll || filter==="plays_earned")
        ? supabase.from("analytics_events")
            .select("id,event_name,user_id,event_data,created_at")
            .in("event_name",["plays_from_order","plays_first_activation","plays_from_spend"])
            .order("created_at",{ascending:false}).limit(lim)
        : {data:[]},

      // Plays given by admin
      (needAll || filter==="plays_given")
        ? supabase.from("analytics_events")
            .select("id,event_name,user_id,event_data,created_at")
            .eq("event_name","plays_adjusted")
            .order("created_at",{ascending:false}).limit(lim)
        : {data:[]},

      // Profile changes
      (needAll || filter==="profile_changes")
        ? supabase.from("analytics_events")
            .select("id,event_name,user_id,event_data,created_at")
            .in("event_name",["profile_updated","profile_name_changed","profile_avatar_changed"])
            .order("created_at",{ascending:false}).limit(lim)
        : {data:[]},
    ]);

    // Map data với _type
    const mapAnalytics = (rows, type) => (rows||[]).map(r => ({
      ...r,
      _type: type,
      amount:    r.event_data?.amount || r.event_data?.plays || 0,
      reason:    r.event_data?.reason || r.event_data?.source || "",
      field:     r.event_data?.field || "",
      points_used: r.event_data?.points_used || 0,
      created_at: r.created_at,
    }));

    const allLogs = [
      ...(orders.data||[]).map(o=>({...o,_type:"order"})),
      ...(games.data||[]).map(g=>({...g,_type:"game",created_at:g.played_at})),
      ...(payments.data||[]).map(p=>({...p,_type:"payment"})),
      ...mapAnalytics(points.data,      "points"),
      ...mapAnalytics(playsBought.data, "plays_bought"),
      ...mapAnalytics(playsEarned.data, "plays_earned"),
      ...mapAnalytics(playsGiven.data,  "plays_given"),
      ...mapAnalytics(profileChanges.data, "profile_change"),
    ]
    .filter(log => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        log.customer_name?.toLowerCase().includes(s) ||
        log.player_name?.toLowerCase().includes(s) ||
        log.user_id?.toLowerCase().includes(s) ||
        log.order_code?.toLowerCase().includes(s) ||
        log.transaction_code?.toLowerCase().includes(s)
      );
    })
    .sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0))
    .slice(off, off+lim);

    res.json({ success:true, data:allLogs, page:Number(page), limit:lim });
  } catch(err) {
    res.status(500).json({ success:false, error:err.message });
  }
});

module.exports = router;
