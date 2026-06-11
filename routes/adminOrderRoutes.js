const express  = require("express");
const router   = express.Router();
const jwt      = require("jsonwebtoken");
const supabase = require("../supabase");
const { pushOrderToIPOS } = require("../services/iposOrderService");

const JWT_SECRET = process.env.JWT_SECRET || "cing-admin-secret-2026";

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ success: false, message: "Token không hợp lệ" }); }
}

// GET /admin/orders/list — danh sách đơn hàng có filter
router.get("/list", requireAdmin, async (req, res) => {
  try {
    const { page=1, limit=50, status, payment_method, search, date_from, date_to } = req.query;
    const off = (Number(page)-1) * Number(limit);

    let query = supabase.from("orders")
      .select("id,order_code,customer_name,customer_phone,total_amount,subtotal,tier_discount,points_discount,status,status_code,payment_method,payment_status,created_at,items,shipping_address,shipping_fee,note,cancel_reason", { count:"exact" })
      .order("created_at", { ascending:false })
      .range(off, off + Number(limit) - 1);

    if (status)         query = query.eq("status", status);
    if (payment_method) query = query.eq("payment_method", payment_method);
    if (date_from)      query = query.gte("created_at", date_from);
    if (date_to)        query = query.lte("created_at", date_to + "T23:59:59");
    if (search)         query = query.or(`order_code.ilike.%${search}%,customer_phone.ilike.%${search}%,customer_name.ilike.%${search}%`);

    const { data, count, error } = await query;
    if (error) throw error;
    res.json({ success:true, data: data||[], total: count||0, page:Number(page), limit:Number(limit) });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

// GET /admin/orders/stats — thống kê đơn hàng
router.get("/stats", requireAdmin, async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const week  = new Date(Date.now() - 7*86400000);

    const [total, todayCount, pending, processing, completed, cancelled, weekRevenue] = await Promise.all([
      supabase.from("orders").select("id",{count:"exact",head:true}),
      supabase.from("orders").select("id",{count:"exact",head:true}).gte("created_at",today.toISOString()),
      supabase.from("orders").select("id",{count:"exact",head:true}).eq("status","pending"),
      supabase.from("orders").select("id",{count:"exact",head:true}).eq("status","processing"),
      supabase.from("orders").select("id",{count:"exact",head:true}).eq("status","completed"),
      supabase.from("orders").select("id",{count:"exact",head:true}).eq("status","cancelled"),
      supabase.from("orders").select("total_amount").eq("payment_status","paid").gte("created_at",week.toISOString()),
    ]);

    const revenue7d = (weekRevenue.data||[]).reduce((s,o)=>s+Number(o.total_amount||0),0);
    res.json({ success:true, data: {
      total:       total.count||0,
      today:       todayCount.count||0,
      pending:     pending.count||0,
      processing:  processing.count||0,
      completed:   completed.count||0,
      cancelled:   cancelled.count||0,
      revenue_7d:  revenue7d,
    }});
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

// GET /admin/orders/detail/:id — chi tiết đơn hàng
router.get("/detail/:id", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from("orders")
      .select("*").eq("id", req.params.id).single();
    if (error || !data) return res.status(404).json({ success:false, message:"Không tìm thấy đơn hàng" });
    res.json({ success:true, data });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

// PUT /admin/orders/status/:id — cập nhật trạng thái đơn
router.put("/status/:id", requireAdmin, async (req, res) => {
  try {
    const { status, note } = req.body;
    const validStatuses = ["pending","confirmed","processing","ready","delivering","completed","cancelled"];
    if (!validStatuses.includes(status))
      return res.status(400).json({ success:false, message:"Trạng thái không hợp lệ" });

    const { data: order } = await supabase.from("orders")
      .select("id,status,customer_phone").eq("id",req.params.id).single();
    if (!order) return res.status(404).json({ success:false, message:"Không tìm thấy đơn hàng" });

    const { error } = await supabase.from("orders").update({
      status, updated_at: new Date().toISOString(),
    }).eq("id", req.params.id);
    if (error) throw error;

    // Ghi log
    await supabase.from("analytics_events").insert({
      event_name: "order_status_updated",
      user_id: String(order.customer_phone||""),
      event_data: { order_id: req.params.id, old_status: order.status, new_status: status, note, admin: req.admin.username },
      created_at: new Date().toISOString(),
    }).catch(()=>{});

    // Realtime notify
    try {
      const { realtimeEventBus } = require("../services/realtime/realtimeEventBus");
      realtimeEventBus.publish({
        event: "order.status.changed",
        delivery_type: "ROOM",
        room: `member:${order.customer_phone}`,
        payload: { order_id: req.params.id, status, note },
        channel: "order",
        timestamp: new Date().toISOString(),
      });
    } catch(e) {}

    res.json({ success:true, message:`Đã cập nhật trạng thái thành "${status}"` });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

// PUT /admin/orders/cancel/:id — huỷ đơn với lý do
router.put("/cancel/:id", requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success:false, message:"Vui lòng nhập lý do huỷ" });

    const { data: order } = await supabase.from("orders")
      .select("id,status,customer_phone").eq("id",req.params.id).single();
    if (!order) return res.status(404).json({ success:false, message:"Không tìm thấy đơn hàng" });
    if (order.status === "completed")
      return res.status(400).json({ success:false, message:"Không thể huỷ đơn đã hoàn thành" });

    await supabase.from("orders").update({
      status: "cancelled",
      cancel_reason: reason,
      updated_at: new Date().toISOString(),
    }).eq("id", req.params.id);

    await supabase.from("analytics_events").insert({
      event_name: "order_cancelled",
      user_id: String(order.customer_phone||""),
      event_data: { order_id: req.params.id, reason, admin: req.admin.username },
      created_at: new Date().toISOString(),
    }).catch(()=>{});

    try {
      const { realtimeEventBus } = require("../services/realtime/realtimeEventBus");
      realtimeEventBus.publish({
        event: "order.status.changed",
        delivery_type: "ROOM",
        room: `member:${order.customer_phone}`,
        payload: { order_id: req.params.id, status:"cancelled", reason },
        channel: "order",
        timestamp: new Date().toISOString(),
      });
    } catch(e) {}

    res.json({ success:true, message:"Đã huỷ đơn hàng" });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});


// PUT /admin/orders/retry-ipos/:id — retry đẩy đơn lên iPOS
router.put("/retry-ipos/:id", requireAdmin, async (req, res) => {
  try {
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    if (order.pos_sync_status === "success") {
      return res.status(400).json({
        success: false,
        message: "Đơn hàng đã đồng bộ iPOS thành công, không cần retry",
      });
    }

    const transactionCode =
      order.order_code ||
      String(order.id);

    const result = await pushOrderToIPOS({
      order,
      transaction_code: transactionCode,
    });

    await supabase.from("analytics_events").insert({
      event_name: result.success ? "admin_retry_ipos_success" : "admin_retry_ipos_failed",
      user_id: String(order.customer_phone || ""),
      event_data: {
        order_id: order.id,
        order_code: order.order_code,
        result,
        admin: req.admin.username,
      },
      created_at: new Date().toISOString(),
    }).catch(() => {});

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Retry iPOS thất bại",
        error: result.error,
      });
    }

    return res.json({
      success: true,
      message: "Đã retry iPOS thành công",
      data: result,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});


module.exports = router;
