const express = require("express");
const jwt = require("jsonwebtoken");
const supabase = require("../supabase");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "cing-admin-secret-2026";

const DELIVERY_STATUS = {
  assigned:   { label:"Đã gán shipper", next:["picked_up","cancelled"] },
  picked_up:  { label:"Đã lấy hàng", next:["delivering","cancelled"] },
  delivering: { label:"Đang giao", next:["arrived","completed","cancelled"] },
  arrived:    { label:"Đã đến nơi", next:["completed"] },
  completed:  { label:"Hoàn thành", next:[] },
  cancelled:  { label:"Đã huỷ", next:[] },
};

function verifyToken(req, res, next) {
  try {
    const token = req.params.token || req.body.token || "";
    req.shipper = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success:false, message:"Link shipper không hợp lệ hoặc đã hết hạn" });
  }
}

router.get("/order/:token", verifyToken, async (req, res) => {
  try {
    const trackingId = req.shipper.tracking_id;

    const { data: tracking, error } = await supabase
      .from("delivery_tracking")
      .select("*")
      .eq("id", trackingId)
      .single();

    if (error || !tracking) {
      return res.status(404).json({ success:false, message:"Không tìm thấy đơn giao" });
    }

    const { data: order } = await supabase
      .from("orders")
      .select("id,order_code,customer_name,customer_phone,total_amount,shipping_address,items,status,created_at")
      .eq("id", tracking.order_id)
      .maybeSingle();

    return res.json({ success:true, data:{ tracking, order } });
  } catch (err) {
    return res.status(500).json({ success:false, error:err.message });
  }
});

router.post("/status/:token", verifyToken, async (req, res) => {
  try {
    const trackingId = req.shipper.tracking_id;
    const { status, note } = req.body || {};

    if (!DELIVERY_STATUS[status]) {
      return res.status(400).json({ success:false, message:"Trạng thái không hợp lệ" });
    }

    const { data: tracking } = await supabase
      .from("delivery_tracking")
      .select("*")
      .eq("id", trackingId)
      .single();

    if (!tracking) {
      return res.status(404).json({ success:false, message:"Không tìm thấy tracking" });
    }

    const currentStatus = tracking.status || tracking.delivery_status;
    const validNext = DELIVERY_STATUS[currentStatus]?.next || [];

    if (!validNext.includes(status)) {
      return res.status(400).json({
        success:false,
        message:`Không thể chuyển từ "${currentStatus}" sang "${status}"`,
      });
    }

    await supabase.from("delivery_tracking").update({
      status,
      delivery_status: status,
      note: note || tracking.note || "",
      updated_at: new Date().toISOString(),
      ...(status === "completed" ? { completed_at:new Date().toISOString() } : {}),
    }).eq("id", trackingId);

    const orderStatus = {
      completed:"completed",
      cancelled:"cancelled",
      delivering:"delivering",
      picked_up:"processing",
      arrived:"delivering",
    }[status];

    if (orderStatus) {
      await supabase.from("orders").update({
        status: orderStatus,
        updated_at: new Date().toISOString(),
      }).eq("id", tracking.order_id);
    }

    try {
      const { data: order } = await supabase
        .from("orders")
        .select("customer_phone,order_code")
        .eq("id", tracking.order_id)
        .single();

      const { realtimeEventBus } = require("../services/realtime/realtimeEventBus");
      realtimeEventBus.publish({
        event: "delivery.status.updated",
        delivery_type: "ROOM",
        room: `member:${order?.customer_phone}`,
        payload: {
          order_id: tracking.order_id,
          status,
          shipper_name: tracking.shipper_name,
          note,
        },
        channel: "delivery",
        timestamp: new Date().toISOString(),
      });
    } catch {}

    return res.json({
      success:true,
      message:`Đã cập nhật: ${DELIVERY_STATUS[status].label}`,
    });
  } catch (err) {
    return res.status(500).json({ success:false, error:err.message });
  }
});

module.exports = router;
