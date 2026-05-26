const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { pushOrderToIPOS } = require("../services/iposOrderService");

router.post("/momo", async (req, res) => {
  const { resultCode, orderId, transId, amount, message } = req.body;
  console.log("[MOMO IPN]", { resultCode, orderId, transId, amount });

  res.json({ success: true });

  if (resultCode !== 0) {
    await supabase.from("payment_transactions")
      .update({ payment_status: "failed", failure_reason: message })
      .eq("transaction_code", orderId);
    return;
  }

  try {
    const { data: payment } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("transaction_code", orderId)
      .single();

    if (!payment) { console.error("[MOMO IPN] Payment not found:", orderId); return; }
    if (payment.order_created === true) { console.log("[MOMO IPN] Already processed:", orderId); return; }

    await supabase.from("payment_transactions")
      .update({ payment_status: "paid", provider_transaction_id: String(transId),
        callback_received: true, webhook_verified: true, paid_at: new Date().toISOString() })
      .eq("transaction_code", orderId);

    const items = Array.isArray(payment.cart_snapshot)
      ? payment.cart_snapshot
      : (payment.cart_snapshot?.items || []);

    if (items.length === 0) { console.error("[MOMO IPN] Empty cart:", orderId); return; }

    const orderCode = "ORD-" + Date.now();
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        order_code: orderCode,
        user_id: payment.user_id,
        customer_name: payment.cart_snapshot?.customer_name || payment.customer_name || "Khách hàng",
        customer_phone: payment.cart_snapshot?.customer_phone || payment.customer_phone || "",
        items: items,
        subtotal: payment.amount,
        shipping_fee: payment.cart_snapshot?.shipping_fee || 0,
        total_amount: payment.amount,
        points_used: payment.cart_snapshot?.points_used || 0,
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

    if (orderErr) { console.error("[MOMO IPN] Create order error:", orderErr.message); return; }
    console.log("[MOMO IPN] Order created:", order.order_code);

    await supabase.from("payment_transactions")
      .update({ order_created: true, order_id: order.id })
      .eq("transaction_code", orderId);

    // 1. Push len iPOS
    try {
      await pushOrderToIPOS({ order });
      console.log("[MOMO IPN] Pushed to iPOS:", order.order_code);
    } catch(e) { console.error("[MOMO IPN] iPOS push failed:", e.message); }

    // 2. Trigger daily missions
    try {
      const { checkOrderMissions } = require("../services/dailyMissionService");
      await checkOrderMissions(order.user_id, order.total_amount);
    } catch(e) { console.warn("[MOMO IPN] Mission check failed:", e.message); }

    // 3. Update partner monthly spending
    try {
      const { updatePartnerMonthlySpending } = require("../services/partnerProgressService");
      await updatePartnerMonthlySpending({ user_id: order.user_id, amount: order.total_amount || 0 });
    } catch(e) { console.warn("[MOMO IPN] Partner spending failed:", e.message); }

    // 4. Tru diem neu co su dung diem
    const pointsUsed = payment?.cart_snapshot?.points_used || 0;
    if (pointsUsed > 0) {
      try {
        const { deductPoints } = require("../services/loyaltyPointService");
        await deductPoints({ phone: payment.user_id, user_id: payment.user_id,
          points: pointsUsed, reason: "Thanh toan don hang " + order.order_code });
        console.log("[MOMO IPN] Deducted " + pointsUsed + " points");
      } catch(e) { console.warn("[MOMO IPN] Point deduction failed:", e.message); }
    }

    // 5. Gui thong bao
    try {
      const { sendNotification } = require("../services/notificationService");
      await sendNotification({ user_id: order.user_id, template_key: "MISSION_COMPLETED",
        custom: { title: "Đặt hàng thành công!", message: "Đơn hàng " + order.order_code + " đang được xử lý." } });
    } catch(e) {}

    // 6. Emit leaderboard spending update
    try {
      const { realtimeEventBus } = require("../services/realtime/realtimeEventBus");
      const { data: topSpenders } = await supabase.from("players")
        .select("user_id, zalo_name, total_spent_all_time, crm_tier")
        .order("total_spent_all_time", { ascending: false }).limit(10);
      realtimeEventBus.publish({ event: "leaderboard.updated", delivery_type: "BROADCAST",
        payload: { type: "spending", leaderboard: topSpenders || [] },
        channel: "leaderboard", timestamp: new Date().toISOString() });
    } catch(e) {}

  } catch(err) {
    console.error("[MOMO IPN] Error:", err.message);
  }
});

module.exports = router;
