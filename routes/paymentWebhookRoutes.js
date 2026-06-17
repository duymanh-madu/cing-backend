const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { pushOrderToIPOS } = require("../services/iposOrderService");
const { calculateOrderPoints } = require("../services/membershipBenefitsService");
const redisClient = require("../services/infrastructure/cache/redisClient");
const { normalizePhone } = require("../utils/phoneIdentity");
const { enqueueCrmSyncRecovery } = require("../services/crm/crmSyncRecoveryWorker");

const momoIpnHandler = async (req, res) => {
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
      console.error("[MOMO IPN] Payment not found:", orderId, "- searching all transactions...");
      const { data: allPay } = await supabase.from("payment_transactions")
        .select("transaction_code, payment_status, order_created")
        .order("created_at", { ascending: false }).limit(3);
      console.error("[MOMO IPN] Recent transactions:", JSON.stringify(allPay));
      return;
    }
    if (payment.order_created === true) {
      console.log("[MOMO IPN] Already processed:", orderId);
      return;
    }

    // Redis lock — tránh race condition khi Momo gọi 2 lần cùng lúc
    const lockKey = 'momo:lock:' + orderId;
    const locked = await redisClient.set(lockKey, '1', 'NX', 'EX', 60).catch(() => null);
    if (!locked) {
      console.log('[MOMO IPN] Lock exists, skip duplicate:', orderId);
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
        subtotal:               snap.subtotal          || payment.amount,
        tier_discount:          snap.tier_discount     || 0,
        points_discount:        snap.points_discount   || 0,
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

    // spending_synced sẽ được đánh dấu sau khi instant spending xử lý xong.

    // Resolve phone từ customer_phone — dùng xuyên suốt thay vì UUID
    const resolvedPhone = normalizePhone(order.customer_phone);

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

    // ─── 1. Push lên iPOS (kèm logic giờ) ───────────────────────
    const nowVN = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    const hourVN = nowVN.getHours();
    // 8:00–23:00: bình thường | 23:00–8:00: vẫn push, thêm note "đặt ngoài giờ"
    const isAfterHours = hourVN >= 23 || hourVN < 8;
    const afterHoursNote = isAfterHours
      ? "[ĐẶT NGOÀI GIỜ] Khách đã thanh toán online. Giao hàng lúc 8:00 sáng hôm sau."
      : "";

    try {
      const orderWithMeta = {
        ...order,
        order_type: snap.order_type || (snap.shipping_address ? "DELI" : "STORE"),
        note: [snap.note || snap.customer_note || "", afterHoursNote].filter(Boolean).join(" | "),
        payment_method: "momo",
      };
      const iposResult = await pushOrderToIPOS({
        order: orderWithMeta,
        transaction_code: orderId,
        momo_trans_id: String(transId || ""),
      });
      if (iposResult.success) {
        console.log("[MOMO IPN] Pushed to iPOS OK:", order.order_code, isAfterHours ? "(after-hours)" : "");
      } else {
        console.error("[MOMO IPN] iPOS push failed:", iposResult.error);
      }
    } catch (e) {
      console.error("[MOMO IPN] iPOS push exception:", e.message);
    }

    // ─── 1b. Thông báo đặc biệt nếu sau 23:00 ─────────────────────
    if (isAfterHours) {
      try {
        const { broadcastNotification } = require("../services/notificationService");
        const playerPhone = normalizePhone(order.customer_phone);
        await broadcastNotification({
          template_key: "CAMPAIGN_BROADCAST",
          target_user_ids: [playerPhone],
          custom: {
            title: "✅ Thanh toán thành công!",
            message: "Đơn hàng của bạn đã được thanh toán thành công. Hiện nay cửa hàng đã đóng cửa, cửa hàng sẽ liên hệ lại với bạn để giao hàng vào 8:00 sáng hôm sau.",
          },
        });
        console.log("[MOMO IPN] After-hours notification sent to", playerPhone);
      } catch (e) {
        console.warn("[MOMO IPN] After-hours notification failed:", e.message);
      }
    }

    // ─── 2. Daily missions ─────────────────────────────────────────
    try {
      const { checkOrderMissions } = require("../services/dailyMissionService");
      await checkOrderMissions(resolvedPhone || order.customer_phone, order.total_amount);
    } catch (e) {
      console.warn("[MOMO IPN] Mission check failed:", e.message);
    }

    // ─── 3. Partner monthly spending ───────────────────────────────
    try {
      const { updatePartnerMonthlySpending } = require("../services/partnerProgressService");
      await updatePartnerMonthlySpending({ user_id: resolvedPhone || order.customer_phone, amount: order.total_amount || 0 });
    } catch (e) {
      console.warn("[MOMO IPN] Partner spending failed:", e.message);
    }

    // ─── 3b. Instant spending sync vào players table ───────────────
    // Cộng ngay tiêu dùng vào players — không đợi iPos xác nhận
    try {
      const phone = resolvedPhone || order.customer_phone;
      const amount = order.total_amount || 0;
      const nowVNStr = new Date().toLocaleDateString("en-CA", { timeZone:"Asia/Ho_Chi_Minh" });

      // Lấy spending hiện tại
      const { data: player } = await supabase.from("players")
        .select("crm_spend_weekly, crm_spend_monthly, crm_spend_yearly, crm_spend_alltime, crm_spend_custom, game_plays, plays_from_spend")
        .eq("user_id", phone).single();

      const spendPerPlay = await supabase.from("app_configs")
        .select("spend_per_play").eq("id",1).single()
        .then(r => r.data?.spend_per_play || 20000)
        .catch(() => 20000);

      if (!player) {
        await supabase.from("players").upsert({
          user_id: phone,
          crm_spend_weekly: amount, crm_spend_monthly: amount,
          crm_spend_yearly: amount, crm_spend_alltime: amount,
          crm_spend_custom: customSpendIncrement,
          plays_from_spend: Math.floor(amount / (spendPerPlay||20000)),
          game_plays: Math.floor(amount / (spendPerPlay||20000)),
          crm_synced_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        console.log(`[MOMO IPN] New player instant spending +${amount} for ${phone}`);
      }
      if (player) {

        const newWeekly   = Number(player.crm_spend_weekly   || 0) + amount;
        const newMonthly  = Number(player.crm_spend_monthly  || 0) + amount;
        const newYearly   = Number(player.crm_spend_yearly   || 0) + amount;
        const newAlltime  = Number(player.crm_spend_alltime  || 0) + amount;

        // Tính lượt chơi mới từ spending
        const oldPlaysFromSpend = Number(player.plays_from_spend || 0);

        // Tính lượt chơi theo đơn hiện tại
        const bonusPlays = Math.floor(amount / spendPerPlay);

        // Tổng số lượt đã được cấp từ chi tiêu
        const newPlaysFromSpend = oldPlaysFromSpend + bonusPlays;

// Custom leaderboard realtime
let customSpendIncrement = 0;

try {
  const { data: cfg } = await supabase
    .from("app_configs")
    .select("custom_leaderboard_from, custom_leaderboard_to")
    .eq("id", 1)
    .single();

  const now = new Date();

  const from = cfg?.custom_leaderboard_from
    ? new Date(cfg.custom_leaderboard_from + "T00:00:00")
    : null;

  const to = cfg?.custom_leaderboard_to
    ? new Date(cfg.custom_leaderboard_to + "T23:59:59")
    : null;

  const inRange =
    from &&
    now >= from &&
    (!to || now <= to);

  if (inRange) {
    customSpendIncrement = amount;
  }
} catch (e) {
  console.warn("[MOMO IPN] Custom leaderboard check failed:", e.message);
}

        const updateData = {
          crm_spend_weekly:  newWeekly,
          crm_spend_monthly: newMonthly,
          crm_spend_yearly:  newYearly,
          crm_spend_alltime: newAlltime,
          crm_spend_custom:
         Number(player.crm_spend_custom || 0) + customSpendIncrement,
          plays_from_spend:  newPlaysFromSpend,
        };

        if (bonusPlays > 0) {
          updateData.game_plays = Number(player.game_plays || 0) + bonusPlays;
          console.log(`[MOMO IPN] +${bonusPlays} plays from spending for ${phone}`);
          // Ghi log vào analytics_events để hiển thị lịch sử
          supabase.from("analytics_events").insert({
            user_id: phone,
            event_name: "plays_added",
            event_data: {
              amount: bonusPlays,
              reason: `Tiêu dùng ${amount.toLocaleString("vi-VN")}đ — đơn ${order.order_code}`,
              new_total: Number(player.game_plays || 0) + bonusPlays,
              source: "spending",
            },
            created_at: new Date().toISOString(),
          }).then(() => {}).catch(() => {});
        }

        const { data: updated, error: updateErr } = await supabase.from("players")
          .update(updateData).eq("user_id", phone).select("crm_spend_alltime,plays_from_spend,game_plays");
        if (updateErr) console.warn("[MOMO IPN] Player update error:", updateErr.message);

        // Đánh dấu đơn đã sync spending
        await supabase.from("orders").update({ spending_synced: true }).eq("id", order.id);

        // Enqueue CRM recovery để phòng trường hợp deploy/restart làm miss iPOS CRM event
        await enqueueCrmSyncRecovery({
          user_id: phone,
          phone,
          order_id: order.id,
          source: "momo_paid",
        }).catch(e => console.warn("[CRM RECOVERY] enqueue from MoMo failed:", e.message));

        console.log(`[MOMO IPN] Instant spending +${amount} for ${phone} | week:${newWeekly} month:${newMonthly} alltime:${newAlltime} plays:${updated?.[0]?.game_plays}`);

        try {
          const io = req.app.get("io") || global._ioInstance || global.io;
          if (io) {
            const { checkAndNotifyTop1Changes } = require("../services/leaderboardResetService");
            await checkAndNotifyTop1Changes(io);
          }
        } catch(e) {
          console.warn("[MOMO IPN] Top1 check failed:", e.message);
        }
      }
    } catch (e) {
      console.warn("[MOMO IPN] Instant spending failed:", e.message);
    }

    // ─── 4. Trừ điểm nếu dùng điểm ────────────────────────────────
    const pointsUsed = snap.points_used || 0;
    if (pointsUsed > 0) {
      try {
        const { deductPoints } = require("../services/loyaltyPointService");
        await deductPoints({
          phone:   resolvedPhone,
          user_id: resolvedPhone,
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
      const playerPhone = normalizePhone(order.customer_phone);
      const { data: player } = await supabase
        .from("players")
        .select("crm_tier")
        .eq("user_id", playerPhone || order.customer_phone)
        .single();
      const tierKey     = player?.crm_tier || "member";
      const finalAmount = order.total_amount || 0;
      const pointsToAdd = calculateOrderPoints(finalAmount, tierKey);
      if (pointsToAdd > 0) {
        const pointPhone = normalizePhone(order.customer_phone);
        await addPoints({
          phone:   pointPhone || order.customer_phone,
          user_id: pointPhone || order.customer_phone,
          points:  pointsToAdd,
          reason:  `Tích điểm đơn hàng ${order.order_code} (${tierKey})`,
        });
        console.log("[MOMO IPN] Added", pointsToAdd, "points for", order.user_id, "tier:", tierKey);
      }
    } catch (e) {
      console.warn("[MOMO IPN] Point addition failed:", e.message);
    }

    // ─── 5b. Spending đã được sync tại section 3b (instant) ────────
    // syncSingleUserSpending bị bỏ để tránh overwrite instant spending

    // ─── 6. Thông báo ──────────────────────────────────────────────
    try {
      const { sendNotification } = require("../services/notificationService");
      await sendNotification({
        user_id:      resolvedPhone || order.user_id,
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
};

router.post("/momo", momoIpnHandler);

/**
 * =====================================================
 * ZALO CHECKOUT SDK CALLBACK / CONFIRM
 * =====================================================
 * Zalo Checkout SDK đi qua MoMo nhưng không gọi MoMo direct từ Mini App.
 * Endpoint này tái sử dụng 100% pipeline MoMo IPN hiện tại:
 * - payment_transactions
 * - orders
 * - iPOS
 * - CRM spending
 * - loyalty points
 * - game plays
 * - leaderboard
 * - notifications
 * - realtime
 */
async function processZaloCheckoutAsPaid(req, res) {
  try {
    const body = req.body || {};

    const orderId =
      body.orderId ||
      body.transaction_code ||
      body.transactionCode ||
      body.zmpOrderId ||
      body.id;

    const resultCode =
      Number(body.resultCode ?? body.result_code ?? 0);

    const transId =
      body.transId ||
      body.transactionId ||
      body.zmpOrderId ||
      body.id ||
      orderId;

    const amount =
      Number(body.amount || 0);

    const message =
      body.msg ||
      body.message ||
      "Zalo Checkout result";

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Missing orderId / transaction_code",
      });
    }

    const fakeReq = {
      ...req,
      body: {
        resultCode,
        orderId,
        transId,
        amount,
        message,
      },
    };

    const fakeRes = {
      json: () => {},
      status: () => fakeRes,
    };

    await momoIpnHandler(fakeReq, fakeRes);

    return res.json({
      success: true,
      message: "Zalo Checkout processed through existing payment pipeline",
      transaction_code: orderId,
      resultCode,
    });
  } catch (err) {
    console.error("[ZALO CHECKOUT] process failed:", err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}

router.post("/zalo/callback", processZaloCheckoutAsPaid);
router.post("/zalo/confirm", processZaloCheckoutAsPaid);

module.exports = router;