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

const DELIVERY_STATUS = {
  assigned:   { label:"Đã gán shipper", color:"#2196F3", next:["picked_up","cancelled"] },
  picked_up:  { label:"Đã lấy hàng",   color:"#FF9800", next:["delivering","cancelled"] },
  delivering: { label:"Đang giao",      color:"#9C27B0", next:["arrived","completed","cancelled"] },
  arrived:    { label:"Đã đến nơi",     color:"#00BCD4", next:["completed"] },
  completed:  { label:"Hoàn thành",     color:"#4CAF50", next:[] },
  cancelled:  { label:"Đã huỷ",         color:"#f44336", next:[] },
};

// GET /admin/delivery/list — danh sách đơn giao
router.get("/list", requireAdmin, async (req, res) => {
  try {
    const { status, search, page=1, limit=50 } = req.query;
    const off = (Number(page)-1)*Number(limit);

    let query = supabase.from("delivery_tracking")
      .select("*", { count:"exact" })
      .order("created_at", { ascending:false })
      .range(off, off+Number(limit)-1);

    if (status) query = query.eq("status", status);
    if (search) query = query.or(`shipper_name.ilike.%${search}%,shipper_phone.ilike.%${search}%`);

    const { data, count, error } = await query;
    if (error) throw error;

    const rows = data || [];
    const orderIds = [...new Set(rows.map(r => r.order_id).filter(Boolean))];

    let orderMap = {};
    if (orderIds.length > 0) {
      const { data: orders, error: orderError } = await supabase
        .from("orders")
        .select("id,order_code,customer_name,customer_phone,total_amount,shipping_address,items")
        .in("id", orderIds);

      if (orderError) throw orderError;

      orderMap = Object.fromEntries((orders || []).map(o => [o.id, o]));
    }

    const enriched = rows.map(r => ({
      ...r,
      orders: orderMap[r.order_id] || null,
    }));

    res.json({ success:true, data: enriched, total: count||0 });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

// GET /admin/delivery/stats — thống kê giao hàng
router.get("/stats", requireAdmin, async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);

    const [total, todayCount, active, completed, cancelled] = await Promise.all([
      supabase.from("delivery_tracking").select("id",{count:"exact",head:true}),
      supabase.from("delivery_tracking").select("id",{count:"exact",head:true}).gte("created_at",today.toISOString()),
      supabase.from("delivery_tracking").select("id",{count:"exact",head:true}).in("status",["assigned","picked_up","delivering","arrived"]),
      supabase.from("delivery_tracking").select("id",{count:"exact",head:true}).eq("status","completed"),
      supabase.from("delivery_tracking").select("id",{count:"exact",head:true}).eq("status","cancelled"),
    ]);

    res.json({ success:true, data: {
      total:     total.count||0,
      today:     todayCount.count||0,
      active:    active.count||0,
      completed: completed.count||0,
      cancelled: cancelled.count||0,
    }});
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

// POST /admin/delivery/assign — gán shipper cho đơn
router.post("/assign", requireAdmin, async (req, res) => {
  try {
    const { order_id, shipper_name, shipper_phone, note } = req.body;
    if (!order_id || !shipper_name)
      return res.status(400).json({ success:false, message:"Thiếu thông tin đơn hàng hoặc tên shipper" });

    // Kiểm tra đơn đã có tracking chưa
    const { data: existing } = await supabase.from("delivery_tracking")
      .select("id,status").eq("order_id", order_id).maybeSingle();

    if (existing && !["cancelled"].includes(existing.status))
      return res.status(400).json({ success:false, message:"Đơn này đã được gán shipper" });

    const { data, error } = await supabase.from("delivery_tracking").insert({
      order_id, shipper_name, shipper_phone: shipper_phone||"",
      status: "assigned", note: note||"",
      assigned_by: req.admin.username,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;

    // Cập nhật trạng thái đơn hàng → delivering
    await supabase.from("orders").update({ status:"delivering", updated_at:new Date().toISOString() })
      .eq("id", order_id).catch(()=>{});

    // Realtime notify
    try {
      const { data: order } = await supabase.from("orders").select("customer_phone").eq("id",order_id).single();
      const { realtimeEventBus } = require("../services/realtime/realtimeEventBus");
      realtimeEventBus.publish({
        event: "delivery.status.updated",
        delivery_type: "ROOM",
        room: `member:${order?.customer_phone}`,
        payload: { order_id, status:"assigned", shipper_name, shipper_phone },
        channel: "delivery",
        timestamp: new Date().toISOString(),
      });
    } catch(e) {}

    res.json({ success:true, message:`Đã gán shipper ${shipper_name}`, data });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

// PUT /admin/delivery/status/:id — cập nhật trạng thái giao hàng
router.put("/status/:id", requireAdmin, async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!DELIVERY_STATUS[status])
      return res.status(400).json({ success:false, message:"Trạng thái không hợp lệ" });

    const { data: tracking } = await supabase.from("delivery_tracking")
      .select("*").eq("id", req.params.id).single();
    if (!tracking) return res.status(404).json({ success:false, message:"Không tìm thấy tracking" });

    const validNext = DELIVERY_STATUS[tracking.status]?.next || [];
    if (!validNext.includes(status))
      return res.status(400).json({ success:false, message:`Không thể chuyển từ "${tracking.status}" sang "${status}"` });

    await supabase.from("delivery_tracking").update({
      status, note: note||tracking.note||"",
      updated_at: new Date().toISOString(),
      ...(status==="completed" ? { completed_at:new Date().toISOString() } : {}),
    }).eq("id", req.params.id);

    // Sync trạng thái đơn hàng
    const orderStatus = { completed:"completed", cancelled:"cancelled", delivering:"delivering", picked_up:"processing" }[status];
    if (orderStatus) {
      await supabase.from("orders").update({ status:orderStatus, updated_at:new Date().toISOString() })
        .eq("id", tracking.order_id).catch(()=>{});
    }

    // Realtime notify user
    try {
      const { data: order } = await supabase.from("orders").select("customer_phone").eq("id",tracking.order_id).single();
      const { realtimeEventBus } = require("../services/realtime/realtimeEventBus");
      realtimeEventBus.publish({
        event: "delivery.status.updated",
        delivery_type: "ROOM",
        room: `member:${order?.customer_phone}`,
        payload: { order_id:tracking.order_id, status, shipper_name:tracking.shipper_name, note },
        channel: "delivery",
        timestamp: new Date().toISOString(),
      });
    } catch(e) {}

    // Gửi push notification cho khách
    try {
      const notifMap = {
        picked_up:  { title:"📦 Shipper đã lấy hàng", msg:"Đơn hàng đang trên đường giao đến bạn!" },
        delivering: { title:"🛵 Đang giao hàng", msg:"Shipper đang trên đường, vui lòng chú ý điện thoại!" },
        delivered:  { title:"✅ Giao hàng thành công", msg:"Đơn hàng đã được giao thành công. Cảm ơn bạn!" },
        failed:     { title:"❌ Giao hàng thất bại", msg:"Rất tiếc, giao hàng thất bại. Chúng tôi sẽ liên hệ lại!" },
        completed:  { title:"🎉 Đơn hàng hoàn thành", msg:"Cảm ơn bạn đã tin tưởng Cing Hu Tang Kinh Bắc!" },
      };
      const notif = notifMap[status];
      if (notif) {
        const { data: ord } = await supabase.from("orders").select("customer_phone,order_code").eq("id",tracking.order_id).single();
        if (ord?.customer_phone) {
          const { broadcastNotification } = require("../services/notificationService");
          await broadcastNotification({
            template_key: "CAMPAIGN_BROADCAST",
            target_user_ids: [ord.customer_phone],
            custom: { title: notif.title, message: `${notif.msg} (Đơn ${ord.order_code})` },
          });
        }
      }
    } catch(e) { console.warn("[DELIVERY] Notify failed:", e.message); }

    res.json({ success:true, message:`Đã cập nhật trạng thái giao hàng: ${DELIVERY_STATUS[status].label}` });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

// GET /admin/delivery/orders-ready — đơn hàng sẵn sàng giao (chưa có shipper)
router.get("/orders-ready", requireAdmin, async (req, res) => {
  try {
    // Lấy đơn có địa chỉ giao, status confirmed/processing, chưa có delivery tracking active
    const { data: orders } = await supabase.from("orders")
      .select("id,order_code,customer_name,customer_phone,total_amount,shipping_address,created_at")
      .in("status",["confirmed","processing","ready"])
      .not("shipping_address","is",null)
      .order("created_at",{ascending:false})
      .limit(50);

    // Lọc bỏ đơn đã có tracking active
    const ids = (orders||[]).map(o=>o.id);
    const { data: activeTracking } = await supabase.from("delivery_tracking")
      .select("order_id").in("order_id",ids).not("status","in","(completed,cancelled)");
    const activeIds = new Set((activeTracking||[]).map(t=>t.order_id));
    const ready = (orders||[]).filter(o=>!activeIds.has(o.id));

    res.json({ success:true, data:ready });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

module.exports = router;
