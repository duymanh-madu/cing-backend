const express  = require("express");
const router   = express.Router();
const jwt      = require("jsonwebtoken");
const supabase = require("../supabase");

const JWT_SECRET = process.env.JWT_SECRET || "cing-admin-secret-2026";

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ success: false, message: "Token không hợp lệ" }); }
}

// GET /admin/payment-dashboard/list — danh sách giao dịch
router.get("/list", requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, status, method, search } = req.query;
    const off = (Number(page) - 1) * Number(limit);

    let query = supabase.from("payment_transactions")
      .select("id,transaction_code,user_id,amount,payment_status,payment_method,created_at,updated_at", { count:"exact" })
      .order("created_at", { ascending: false })
      .range(off, off + Number(limit) - 1);

    if (status) query = query.eq("payment_status", status);
    if (method) query = query.eq("payment_method", method);
    if (search) query = query.or(`transaction_code.ilike.%${search}%,user_id.ilike.%${search}%`);

    const { data, count, error } = await query;
    if (error) throw error;
    const rows = (data || []).map(txn => ({
      ...txn,
      customer_name: "",
    }));

    res.json({ success: true, data: rows, total: count || 0, page: Number(page), limit: Number(limit) });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /admin/payment-dashboard/stats — thống kê tổng quan
router.get("/stats", requireAdmin, async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const week  = new Date(Date.now() - 7*86400000);
    const month = new Date(Date.now() - 30*86400000);

    const [paid, pending, failed, todayPaid, weekPaid, monthPaid] = await Promise.all([
      supabase.from("payment_transactions").select("amount").eq("payment_status","paid"),
      supabase.from("payment_transactions").select("id",{count:"exact",head:true}).eq("payment_status","pending"),
      supabase.from("payment_transactions").select("id",{count:"exact",head:true}).eq("payment_status","failed"),
      supabase.from("payment_transactions").select("amount").eq("payment_status","paid").gte("created_at",today.toISOString()),
      supabase.from("payment_transactions").select("amount").eq("payment_status","paid").gte("created_at",week.toISOString()),
      supabase.from("payment_transactions").select("amount").eq("payment_status","paid").gte("created_at",month.toISOString()),
    ]);

    const sum = arr => (arr.data||[]).reduce((s,p)=>s+Number(p.amount||0),0);

    res.json({ success: true, data: {
      total_revenue:   sum(paid),
      revenue_today:   sum(todayPaid),
      revenue_week:    sum(weekPaid),
      revenue_month:   sum(monthPaid),
      total_paid:      (paid.data||[]).length,
      total_pending:   pending.count || 0,
      total_failed:    failed.count  || 0,
    }});
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /admin/payment-dashboard/detail/:id — chi tiết giao dịch
router.get("/detail/:id", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from("payment_transactions")
      .select("*").eq("id", req.params.id).single();
    if (error || !data) return res.status(404).json({ success: false, message: "Không tìm thấy giao dịch" });
    res.json({ success: true, data });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /admin/payment-dashboard/refund/:id — ghi nhận hoàn tiền thủ công
router.post("/refund/:id", requireAdmin, async (req, res) => {
  try {
    const { reason, amount } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: "Vui lòng nhập lý do hoàn tiền" });

    const { data: txn } = await supabase.from("payment_transactions")
      .select("*").eq("id", req.params.id).single();
    if (!txn) return res.status(404).json({ success: false, message: "Không tìm thấy giao dịch" });
    if (txn.payment_status !== "paid")
      return res.status(400).json({ success: false, message: "Chỉ hoàn tiền giao dịch đã thanh toán" });

    const refundAmount = Number(amount) || Number(txn.amount);

    // Cập nhật trạng thái
    await supabase.from("payment_transactions").update({
      payment_status: "refunded",
      updated_at: new Date().toISOString(),
      metadata: { ...(txn.metadata||{}), refund_reason: reason, refund_amount: refundAmount, refunded_by: req.admin.username, refunded_at: new Date().toISOString() }
    }).eq("id", req.params.id);

    // Ghi log analytics
    await supabase.from("analytics_events").insert({
      event_name: "payment_refunded",
      user_id: String(txn.user_id || ""),
      event_data: { transaction_id: req.params.id, amount: refundAmount, reason, admin: req.admin.username },
      created_at: new Date().toISOString(),
    }).catch(()=>{});

    res.json({ success: true, message: `Đã ghi nhận hoàn tiền ${new Intl.NumberFormat("vi-VN").format(refundAmount)}đ` });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /admin/payment-dashboard/failed — danh sách giao dịch thất bại gần đây
router.get("/failed", requireAdmin, async (req, res) => {
  try {
    const { data } = await supabase.from("payment_transactions")
      .select("id,transaction_code,user_id,amount,payment_method,created_at")
      .eq("payment_status","failed")
      .order("created_at",{ascending:false})
      .limit(100);
    res.json({ success: true, data: data || [] });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;

// GET /admin/payment-dashboard/ipos-transactions/:phone — lịch sử giao dịch iPOS của 1 khách
router.get("/ipos-transactions/:phone", requireAdmin, async (req, res) => {
  try {
    const phone = req.params.phone.replace(/\D/g,"");
    const userId = phone.startsWith("84") ? phone : "84" + phone.slice(1);
    const { getMemberTransactions, getMembershipLog } = require("../services/foodbook");
    const [txnRes, logRes] = await Promise.all([
      getMemberTransactions(userId, 1),
      getMembershipLog(userId, { page:1, log_type:"PAY", page_size:100 }),
    ]);
    res.json({ success:true, data: {
      transactions: txnRes.data?.transactions || [],
      logs:         logRes.data?.logs || [],
      total_spent:  txnRes.data?.total_spent || 0,
      total_orders: txnRes.data?.total_orders || 0,
    }});
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});
