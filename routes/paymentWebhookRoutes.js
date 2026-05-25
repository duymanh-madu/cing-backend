const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { pushOrderToIPOS } = require("../services/iposOrderService");

/**
 * POST /api/payment/webhook/momo
 * MoMo IPN - don gian, truc tiep, khong qua abstraction
 */
router.post("/momo", async (req, res) => {
  const { resultCode, orderId, transId, amount, message } = req.body;
  
  console.log("[MOMO IPN]", { resultCode, orderId, transId, amount });

  // Phai tra 200 ngay lap tuc cho MoMo
  res.json({ success: true });

  // Xu ly async phia sau
  if (resultCode !== 0) {
    console.log("[MOMO IPN] Payment failed:", message);
    await supabase.from("payment_transactions")
      .update({ payment_status: "failed", failure_reason: message })
      .eq("transaction_code", orderId);
    return;
  }

  try {
    // 1. Lay thong tin payment tu DB
    const { data: payment } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("transaction_code", orderId)
      .single();

    if (!payment) {
      console.error("[MOMO IPN] Payment not found:", orderId);
      return;
    }

    // 2. Kiem tra da xu ly chua
    if (payment.order_created === true) {
      console.log("[MOMO IPN] Already processed:", orderId);
      return;
    }

    // 3. Cap nhat thanh paid
    await supabase.from("payment_transactions")
      .update({
        payment_status: "paid",
        provider_transaction_id: String(transId),
        callback_received: true,
        webhook_verified: true,
        paid_at: new Date().toISOString(),
      })
      .eq("transaction_code", orderId);

    // 4. Tao order trong Supabase
    const items = Array.isArray(payment.cart_snapshot) 
      ? payment.cart_snapshot 
      : (payment.cart_snapshot?.items || []);

    if (items.length === 0) {
      console.error("[MOMO IPN] Empty cart for:", orderId);
      return;
    }

    const orderCode = `ORD-${Date.now()}`;
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        order_code: orderCode,
        user_id: payment.user_id,
        items: items,
        subtotal: payment.amount,
        shipping_fee: payment.cart_snapshot?.shipping_fee || 0,
        total_amount: payment.amount,
        payment_method: payment.payment_method || "momo",
        payment_status: "paid",
        payment_transaction_id: payment.id,
        status: "confirmed",
        status_code: "confirmed",
        status_text: "Đã xác nhận",
        shipping_address: payment.cart_snapshot?.shipping_address || "",
      })
      .select()
      .single();

    if (orderErr) {
      console.error("[MOMO IPN] Create order error:", orderErr.message);
      return;
    }

    console.log("[MOMO IPN] Order created:", order.order_code);

    // 5. Danh dau order_created
    await supabase.from("payment_transactions")
      .update({ order_created: true, order_id: order.id })
      .eq("transaction_code", orderId);

    // 6. Push len iPOS
    try {
      await pushOrderToIPOS({ order });
      console.log("[MOMO IPN] Pushed to iPOS:", order.order_code);

    // Trigger daily missions check
    try {
      const { checkOrderMissions } = require("../services/dailyMissionService");
      await checkOrderMissions(order.user_id, order.total_amount);
      console.log("[MOMO IPN] Mission check done for:", order.user_id);
    } catch(e) { console.warn("[MOMO IPN] Mission check failed:", e.message); }

    // Send order notification
    try {
      const { sendNotification } = require("../services/notificationService");
      await sendNotification({
        user_id: order.user_id,
        template_key: "MISSION_COMPLETED",
        custom: { title: "Đặt hàng thành công!", message: "Đơn hàng " + order.order_code + " đang được xử lý." }
      });
    } catch(e) {}
    } catch(iposErr) {
      console.error("[MOMO IPN] iPOS push failed:", iposErr.message);
      // Khong throw - order da duoc tao thanh cong
    }

  } catch(err) {
    console.error("[MOMO IPN] Error:", err.message);
  }
});

module.exports = router;
