const express =
  require("express");

const router =
  express.Router();

const {

  getDashboardSummary,

} = require(
  "../services/adminAnalyticsService"
);

/**
 * =========================================
 * DASHBOARD SUMMARY
 * =========================================
 */

router.get(
  "/dashboard",
  async (
    req,
    res
  ) => {

    try {

      const data =
        await getDashboardSummary();

      return res.json({

        success: true,

        data,

      });

    } catch (error) {

      console.error(
        "dashboard error:",
        error.message
      );

      return res.status(
        500
      ).json({

        success: false,

        message:
          error.message,

      });

    }

  }
);

/**
 * =========================================
 * EXPORT
 * =========================================
 */

module.exports =
  router;
const jwt = require("jsonwebtoken");
const supabase = require("../supabase");
const JWT_SECRET = process.env.JWT_SECRET || "cing-admin-secret-2026";

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ success: false, message: "Token không hợp lệ" }); }
}

// GET /admin/analytics/revenue-by-hour — doanh thu theo giờ hôm nay
router.get("/revenue-by-hour", requireAdmin, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("payment_transactions")
      .select("amount, created_at")
      .eq("payment_status", "paid")
      .gte("created_at", today.toISOString());

    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, orders: 0 }));
    for (const p of (data || [])) {
      const h = new Date(p.created_at).getHours();
      hours[h].revenue += Number(p.amount || 0);
      hours[h].orders += 1;
    }
    res.json({ success: true, data: hours });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /admin/analytics/revenue-by-day?days=30 — doanh thu N ngày gần nhất
router.get("/revenue-by-day", requireAdmin, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const from = new Date();
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from("payment_transactions")
      .select("amount, created_at")
      .eq("payment_status", "paid")
      .gte("created_at", from.toISOString());

    const dayMap = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dayMap[key] = { date: key, label: d.toLocaleDateString("vi-VN", { day:"2-digit", month:"2-digit" }), revenue: 0, orders: 0 };
    }
    for (const p of (data || [])) {
      const key = p.created_at.slice(0, 10);
      if (dayMap[key]) {
        dayMap[key].revenue += Number(p.amount || 0);
        dayMap[key].orders += 1;
      }
    }
    res.json({ success: true, data: Object.values(dayMap) });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /admin/analytics/top-products — món bán chạy nhất
router.get("/top-products", requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const from = new Date();
    from.setDate(from.getDate() - days);

    const { data: orders } = await supabase
      .from("orders")
      .select("items, total_amount, status")
      .gte("created_at", from.toISOString())
      .not("items", "is", null);

    const productMap = {};
    for (const order of (orders || [])) {
      const items = Array.isArray(order.items) ? order.items : [];
      for (const item of items) {
        const name = item.name || item.product_name || "Không rõ";
        if (!productMap[name]) productMap[name] = { name, quantity: 0, revenue: 0 };
        productMap[name].quantity += Number(item.quantity || 1);
        productMap[name].revenue += Number(item.price || 0) * Number(item.quantity || 1);
      }
    }
    const sorted = Object.values(productMap).sort((a, b) => b.quantity - a.quantity).slice(0, 20);
    res.json({ success: true, data: sorted });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /admin/analytics/funnel — funnel chuyển đổi
router.get("/funnel", requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const from = new Date();
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);

    const [totalPlayers, activePlayers, orderedPlayers, paidPlayers, repeatPlayers] = await Promise.all([
      supabase.from("players").select("user_id", { count:"exact", head:true }),
      supabase.from("players").select("user_id", { count:"exact", head:true })
        .gte("updated_at", from.toISOString()),
      supabase.from("orders").select("customer_phone", { count:"exact", head:true })
        .gte("created_at", from.toISOString()),
      supabase.from("payment_transactions").select("user_id", { count:"exact", head:true })
        .eq("payment_status", "paid").gte("created_at", from.toISOString()),
      supabase.from("players").select("user_id", { count:"exact", head:true })
        .gt("crm_orders_alltime", 1),
    ]);

    res.json({ success: true, data: [
      { label: "Tổng thành viên",      value: totalPlayers.count || 0,  color: "#2196F3" },
      { label: "Hoạt động trong kỳ",   value: activePlayers.count || 0, color: "#FF9800" },
      { label: "Đã đặt hàng",          value: orderedPlayers.count || 0,color: "#9C27B0" },
      { label: "Đã thanh toán",        value: paidPlayers.count || 0,   color: "#4CAF50" },
      { label: "Khách quay lại",       value: repeatPlayers.count || 0, color: "#D4531C" },
    ]});
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /admin/analytics/payment-methods — phân tích phương thức thanh toán
router.get("/payment-methods", requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const from = new Date();
    from.setDate(from.getDate() - days);

    const { data } = await supabase
      .from("payment_transactions")
      .select("payment_method, amount")
      .eq("payment_status", "paid")
      .gte("created_at", from.toISOString());

    const methodMap = {};
    for (const p of (data || [])) {
      const m = p.payment_method || "Không rõ";
      if (!methodMap[m]) methodMap[m] = { method: m, count: 0, revenue: 0 };
      methodMap[m].count += 1;
      methodMap[m].revenue += Number(p.amount || 0);
    }
    res.json({ success: true, data: Object.values(methodMap).sort((a, b) => b.revenue - a.revenue) });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /admin/analytics/summary-kpi — KPI tổng hợp so sánh kỳ này vs kỳ trước
router.get("/summary-kpi", requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const now = new Date();
    const curFrom = new Date(now - days * 86400000);
    const prevFrom = new Date(now - 2 * days * 86400000);

    const fetchKPI = async (from, to) => {
      const [orders, payments, newPlayers] = await Promise.all([
        supabase.from("orders").select("id", { count:"exact", head:true })
          .gte("created_at", from.toISOString()).lt("created_at", to.toISOString()),
        supabase.from("payment_transactions").select("amount")
          .eq("payment_status", "paid")
          .gte("created_at", from.toISOString()).lt("created_at", to.toISOString()),
        supabase.from("players").select("user_id", { count:"exact", head:true })
          .gte("created_at", from.toISOString()).lt("created_at", to.toISOString()),
      ]);
      const revenue = (payments.data || []).reduce((s, p) => s + Number(p.amount || 0), 0);
      return { orders: orders.count || 0, revenue, newPlayers: newPlayers.count || 0 };
    };

    const [current, previous] = await Promise.all([
      fetchKPI(curFrom, now),
      fetchKPI(prevFrom, curFrom),
    ]);

    const pct = (cur, prev) => prev === 0 ? 100 : Math.round((cur - prev) / prev * 100);

    res.json({ success: true, data: {
      orders:     { current: current.orders,     previous: previous.orders,     pct: pct(current.orders, previous.orders) },
      revenue:    { current: current.revenue,    previous: previous.revenue,    pct: pct(current.revenue, previous.revenue) },
      newPlayers: { current: current.newPlayers, previous: previous.newPlayers, pct: pct(current.newPlayers, previous.newPlayers) },
      days,
    }});
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});
