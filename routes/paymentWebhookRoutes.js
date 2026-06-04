const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { pushOrderToIPOS } = require("../services/iposOrderService");
const { calculateOrderPoints } = require("../services/membershipBenefitsService");

router.post("/momo", async (req, res) => {
  const { resultCode, orderId, transId, amount, message } = req.body;
  console.log("[MOMO IPN]", { resultCode, orderId, transId, amount });

  // Trả 200 ngay — không để MoMo timeout rồi retry
  res.json({ success: true });

  if (resultCode !== 0) {
    await supabase
      .from("payment_transactions")
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

    if (!payment) {
      console.error("[MOMO IPN] Payment not found:", orderId);
      return;
    }
    if (payment.order_created === true) {
      console.log("[MOMO IPN] Already processed:", orderId);
      return;
    }

    // Update payment status
    await supabase
      .from("payment_transactions")
      .update({
        payment_status:          "paid",
        provider_transaction_id: String(transId),
        callback_received:       true,
        webhook_verified:        true,
        paid_at:                 new Date().toISOString(),
      })
      .eq("transaction_code", orderId);

    const snap  = payment.cart_snapshot || {};
    const items = Array.isArray(payment.cart_snapshot)
      ? payment.cart_snapshot
      : (snap.items || []);

    if (items.length === 0) {
      console.error("[MOMO IPN] Empty cart:", orderId);
      return;
    }

    const orderCode = "ORD-" + Date.now();

    // FIX: include latitude, longitude, address_detail từ cart_snapshot
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        order_code:             orderCode,
        user_id:                payment.user_id,
        customer_name:          snap.customer_name    || payment.customer_name    || "Khách hàng",
        customer_phone:         snap.customer_phone   || payment.customer_phone   || "",
        items,
        subtotal:               payment.amount,
        shipping_fee:           snap.shipping_fee     || 0,
        total_amount:           payment.amount,
        points_used:            snap.points_used      || 0,
        payment_method:         payment.payment_method || "momo",
        payment_status:         "paid",
        payment_transaction_id: payment.id,
        status:                 "confirmed",
        status_code:            "confirmed",
        status_text:            "Đã xác nhận",
        // Địa chỉ giao hàng
        shipping_address:       snap.shipping_address || "",
        // FIX: toạ độ và chi tiết địa chỉ để iPOS build đúng payload DELI
        // latitude/longitude: removed - columns không tồn tại trong orders table
        // address_detail: removed - column không tồn tại trong orders table
        // order_type và note không có trong schema orders table
      })
      .select()
      .single();

    if (orderErr) {
      console.error("[MOMO IPN] Create order error:", orderErr.message);
      return;
    }
    console.log("[MOMO IPN] Order created:", order.order_code);

    await supabase
      .from("payment_transactions")
      .update({ order_created: true, order_id: order.id })
      .eq("transaction_code", orderId);

    // ─── 0. Emit payment.success realtime → frontend navigate ngay ──
    try {
      const { realtimeEventBus } = require("../services/realtime/realtimeEventBus");
      realtimeEventBus.publish({
        event:         "payment.success",
        delivery_type: "BROADCAST",
        payload: {
          user_id:     order.user_id,
          order_id:    order.id,
          order_code:  order.order_code,
          amount:      order.total_amount,
          transaction: orderId,
        },
        channel:   "payment",
        timestamp: new Date().toISOString(),
      });
      console.log("[MOMO IPN] Emitted payment.success for", order.user_id);
    } catch(e) { console.warn("[MOMO IPN] Realtime emit failed:", e.message); }

    // ─── 1. Push lên iPOS ──────────────────────────────────────────
    try {
      // Bổ sung order_type và note từ snap vì orders table không có columns này
      const orderWithMeta = {
        ...order,
        order_type: snap.order_type || (snap.shipping_address ? "DELI" : "STORE"),
        note: snap.note || "",
        payment_method: "momo",
      };
      const iposResult = await pushOrderToIPOS({
        order: orderWithMeta,
        transaction_code: orderId,
      });
      if (iposResult.success) {
        console.log("[MOMO IPN] Pushed to iPOS OK:", order.order_code);
      } else {
        console.error("[MOMO IPN] iPOS push failed:", iposResult.error);
      }
    } catch (e) {
      console.error("[MOMO IPN] iPOS push exception:", e.message);
    }

    // ─── 2. Daily missions ─────────────────────────────────────────
    try {
      const { checkOrderMissions } = require("../services/dailyMissionService");
      await checkOrderMissions(order.user_id, order.total_amount);
    } catch (e) {
      console.warn("[MOMO IPN] Mission check failed:", e.message);
    }

    // ─── 3. Partner monthly spending ───────────────────────────────
    try {
      const { updatePartnerMonthlySpending } = require("../services/partnerProgressService");
      await updatePartnerMonthlySpending({ user_id: order.user_id, amount: order.total_amount || 0 });
    } catch (e) {
      console.warn("[MOMO IPN] Partner spending failed:", e.message);
    }

    // ─── 4. Trừ điểm nếu dùng điểm ────────────────────────────────
    const pointsUsed = snap.points_used || 0;
    if (pointsUsed > 0) {
      try {
        const { deductPoints } = require("../services/loyaltyPointService");
        await deductPoints({
          phone:   payment.user_id,
          user_id: payment.user_id,
          points:  pointsUsed,
          reason:  "Thanh toan don hang " + order.order_code,
        });
        console.log("[MOMO IPN] Deducted", pointsUsed, "points");
      } catch (e) {
        console.warn("[MOMO IPN] Point deduction failed:", e.message);
      }
    }

    // ─── 5. Cộng điểm theo tier ────────────────────────────────────
    try {
      const { addPoints } = require("../services/loyaltyPointService");
      const { data: player } = await supabase
        .from("players")
        .select("crm_tier")
        .eq("user_id", order.user_id)
        .single();
      const tierKey     = player?.crm_tier || "member";
      const finalAmount = order.total_amount || 0;
      const pointsToAdd = calculateOrderPoints(finalAmount, tierKey);
      if (pointsToAdd > 0) {
        await addPoints({
          phone:   order.user_id,
          user_id: order.user_id,
          points:  pointsToAdd,
          reason:  `Tích điểm đơn hàng ${order.order_code} (${tierKey})`,
        });
        console.log("[MOMO IPN] Added", pointsToAdd, "points for", order.user_id, "tier:", tierKey);
      }
    } catch (e) {
      console.warn("[MOMO IPN] Point addition failed:", e.message);
    }

    // ─── 5b. Sync spending → cộng lượt chơi game ──────────────────
    try {
      const { syncSingleUserSpending } = require("../services/crm/crmSpendingSyncService");
      // Dùng customer_phone thật để getMembershipLog hoạt động đúng
      const spendPhone = (order.customer_phone || "").replace(/\D/g,"").replace(/^84/,"0");
      if (spendPhone && spendPhone.length >= 9) {
        await syncSingleUserSpending(spendPhone);
        console.log("[MOMO IPN] Spending synced for", spendPhone);
      }
    } catch(e) {
      console.warn("[MOMO IPN] Spending sync failed:", e.message);
    }

    // ─── 6. Thông báo ──────────────────────────────────────────────
    try {
      const { sendNotification } = require("../services/notificationService");
      await sendNotification({
        user_id:      order.user_id,
        template_key: "MISSION_COMPLETED",
        custom: {
          title:   "Đặt hàng thành công!",
          message: `Đơn hàng ${order.order_code} đang được xử lý.`,
        },
      });
    } catch (e) {}

    // ─── 7. Leaderboard realtime ────────────────────────────────────
    try {
      const { realtimeEventBus } = require("../services/realtime/realtimeEventBus");
      const { data: topSpenders } = await supabase
        .from("players")
        .select("user_id, zalo_name, total_spent_all_time, crm_tier")
        .order("total_spent_all_time", { ascending: false })
        .limit(10);
      realtimeEventBus.publish({
        event:         "leaderboard.updated",
        delivery_type: "BROADCAST",
        payload:       { type: "spending", leaderboard: topSpenders || [] },
        channel:       "leaderboard",
        timestamp:     new Date().toISOString(),
      });
    } catch (e) {}

  } catch (err) {
    console.error("[MOMO IPN] Unhandled error:", err.message);
  }
});

module.exports = router;