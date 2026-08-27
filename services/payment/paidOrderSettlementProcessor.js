const supabase = require("../../supabase");
const { pushOrderToIPOS } =
  require("../iposOrderService");
const { calculateOrderPoints } =
  require("../membershipBenefitsService");
const redisClient =
  require("../infrastructure/cache/redisClient");
const { normalizePhone } =
  require("../../utils/phoneIdentity");

async function awardGamePlaysForPaidOrder({ phone, order }) {
  const userId = normalizePhone(phone || order?.customer_phone || order?.user_id || "");
  const orderCode = String(order?.order_code || "").trim();
  const subtotal = Number(order?.subtotal || 0);
  const shippingFee = Number(order?.shipping_fee || 0);
  const totalAmount = Number(order?.total_amount || 0);
  const amount = subtotal > 0 ? subtotal : Math.max(0, totalAmount - shippingFee);

  if (!userId || !orderCode || amount <= 0) {
    return { success: false, skipped: true, reason: "invalid_order" };
  }

  const { data: existingLog } = await supabase
    .from("analytics_events")
    .select("id")
    .eq("user_id", userId)
    .eq("event_name", "plays_added")
    .contains("event_data", {
      source: "order_spending",
      order_code: orderCode,
    })
    .limit(1)
    .maybeSingle();

  if (existingLog) {
    return { success: true, skipped: true, reason: "already_awarded", order_code: orderCode };
  }

  const spendPerPlay = await supabase.from("app_configs")
    .select("spend_per_play").eq("id", 1).single()
    .then(r => Number(r.data?.spend_per_play || 20000))
    .catch(() => 20000);

  const playsToAdd = Math.floor(amount / (spendPerPlay || 20000));
  if (playsToAdd <= 0) {
    return { success: true, skipped: true, reason: "below_threshold", order_code: orderCode };
  }

  const { data: player } = await supabase
    .from("players")
    .select("game_plays, plays_from_spend")
    .eq("user_id", userId)
    .maybeSingle();

  const newTotal = Number(player?.game_plays || 0) + playsToAdd;

  const { addPlays } = require("../loyaltyPointService");
  await addPlays({
    user_id: userId,
    amount: playsToAdd,
    reason: `Tiêu dùng ${amount.toLocaleString("vi-VN")}đ — đơn ${orderCode}`,
    new_total: newTotal,
    metadata: {
      source: "order_spending",
      order_code: orderCode,
      order_amount: amount,
      spend_per_play: spendPerPlay,
    },
  });

  await supabase.from("players")
    .update({
      game_plays: newTotal,
      plays_from_spend: Number(player?.plays_from_spend || 0) + playsToAdd,
    })
    .eq("user_id", userId);

  console.log(`[GAME] Order spend bonus: +${playsToAdd} plays for ${userId} | ${orderCode} | amount=${amount}`);
  return { success: true, plays: playsToAdd, order_code: orderCode };
}


function commerceCompletionError(
  code,
  message = code
) {
  const error =
    new Error(message);

  error.code =
    code;

  return error;
}


function buildCompletionResult({
  payment,
  order,
  replayed = false,
}) {
  if (
    !payment?.id ||
    !order?.id ||
    String(
      order.payment_transaction_id
    ) !==
      String(payment.id)
  ) {
    throw commerceCompletionError(
      "COMMERCE_COMPLETION_ORDER_LINK_INVALID"
    );
  }

  return {
    success: true,
    completed: true,
    replayed:
      Boolean(replayed),
    payment_transaction_id:
      payment.id,
    order_id:
      order.id,
    order_code:
      order.order_code,
    order,
  };
}


async function findDurableOrderForPayment(
  payment
) {
  if (!payment?.id) {
    return null;
  }

  /*
   * Prefer the canonical payment pointer when present.
   */
  if (payment.order_id != null) {
    const {
      data: pointedOrder,
      error: pointedError,
    } = await supabase
      .from("orders")
      .select("*")
      .eq(
        "id",
        payment.order_id
      )
      .maybeSingle();

    if (pointedError) {
      throw commerceCompletionError(
        "COMMERCE_COMPLETION_ORDER_LOOKUP_FAILED",
        pointedError.message
      );
    }

    if (!pointedOrder) {
      throw commerceCompletionError(
        "COMMERCE_COMPLETION_PAYMENT_POINTER_MISSING"
      );
    }

    if (
      String(
        pointedOrder.payment_transaction_id
      ) !==
        String(payment.id)
    ) {
      throw commerceCompletionError(
        "COMMERCE_COMPLETION_PAYMENT_POINTER_CONFLICT"
      );
    }

    return pointedOrder;
  }

  /*
   * The durable payment_transaction_id fence is also a replay
   * authority. This allows recovery even if an earlier process
   * created the order but failed before updating payment.order_id.
   */
  const {
    data: linkedOrder,
    error: linkedError,
  } = await supabase
    .from("orders")
    .select("*")
    .eq(
      "payment_transaction_id",
      payment.id
    )
    .maybeSingle();

  if (linkedError) {
    throw commerceCompletionError(
      "COMMERCE_COMPLETION_ORDER_LOOKUP_FAILED",
      linkedError.message
    );
  }

  if (!linkedOrder) {
    return null;
  }

  /*
   * Heal the payment projection from the durable order link.
   * Correctness comes from orders.payment_transaction_id;
   * Redis is never financial/order authority.
   */
  const {
    error: projectionError,
  } = await supabase
    .from(
      "payment_transactions"
    )
    .update({
      order_created: true,
      order_id:
        linkedOrder.id,
    })
    .eq(
      "id",
      payment.id
    );

  if (projectionError) {
    throw commerceCompletionError(
      "COMMERCE_COMPLETION_PAYMENT_PROJECTION_FAILED",
      projectionError.message
    );
  }

  payment.order_created =
    true;

  payment.order_id =
    linkedOrder.id;

  return linkedOrder;
}


async function processPaidOrderSettlement({
  req,
  orderId,
  transId,
  amount,
}) {
  let lockKey = null;
  let lockAcquired = false;

  try {
    const {
      data: payment,
      error: paymentError,
    } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq(
        "transaction_code",
        orderId
      )
      .maybeSingle();

    if (paymentError) {
      throw commerceCompletionError(
        "COMMERCE_PAYMENT_LOOKUP_FAILED",
        paymentError.message
      );
    }

    if (!payment) {
      throw commerceCompletionError(
        "COMMERCE_PAYMENT_NOT_FOUND"
      );
    }

    if (
      payment.payment_purpose &&
      payment.payment_purpose !==
        "order"
    ) {
      throw commerceCompletionError(
        "COMMERCE_PAYMENT_PURPOSE_INVALID"
      );
    }

    /*
     * Durable replay precedes Redis.
     *
     * payment.order_created is only a projection; the actual
     * completion proof is the durable order linked to this
     * payment transaction.
     */
    const replayOrder =
      await findDurableOrderForPayment(
        payment
      );

    if (replayOrder) {
      return buildCompletionResult({
        payment,
        order:
          replayOrder,
        replayed:
          true,
      });
    }

    /*
     * Redis remains contention optimization only.
     * It must never turn an incomplete commerce settlement into
     * a successful/no-op result.
     */
    lockKey =
      "commerce:paid-order:" +
      payment.id;

    lockAcquired =
      Boolean(
        await redisClient
          .set(
            lockKey,
            "1",
            "NX",
            "EX",
            60
          )
          .catch(
            () => null
          )
      );

    if (!lockAcquired) {
      /*
       * Another worker may have completed between our first
       * replay read and lock acquisition.
       */
      const {
        data: refreshedPayment,
        error: refreshedError,
      } = await supabase
        .from(
          "payment_transactions"
        )
        .select("*")
        .eq(
          "id",
          payment.id
        )
        .maybeSingle();

      if (refreshedError) {
        throw commerceCompletionError(
          "COMMERCE_PAYMENT_REPLAY_REFRESH_FAILED",
          refreshedError.message
        );
      }

      const concurrentOrder =
        await findDurableOrderForPayment(
          refreshedPayment ||
            payment
        );

      if (concurrentOrder) {
        return buildCompletionResult({
          payment:
            refreshedPayment ||
            payment,
          order:
            concurrentOrder,
          replayed:
            true,
        });
      }

      throw commerceCompletionError(
        "COMMERCE_COMPLETION_IN_PROGRESS"
      );
    }

    /*
     * External provider settlement projection.
     *
     * Cing Wallet is an internal tender. Its paid status and
     * settlement proof were already written atomically by the
     * Wallet PostgreSQL authority and must never be rewritten as
     * webhook/provider proof here.
     */
    const isInternalWallet =
      payment.payment_method ===
        "cing_wallet";

    if (!isInternalWallet) {
      const {
        error: paymentUpdateError,
      } = await supabase
        .from(
          "payment_transactions"
        )
        .update({
          payment_status:
            "paid",
          provider_transaction_id:
            String(transId),
          callback_received:
            true,
          webhook_verified:
            true,
          paid_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "id",
          payment.id
        );

      if (paymentUpdateError) {
        throw commerceCompletionError(
          "COMMERCE_PAYMENT_PAID_PROJECTION_FAILED",
          paymentUpdateError.message
        );
      }
    }

    const snap  = payment.cart_snapshot || {};
    const items = Array.isArray(payment.cart_snapshot)
      ? payment.cart_snapshot
      : (snap.items || []);

    if (items.length === 0) {
      throw commerceCompletionError(
        "COMMERCE_ORDER_CART_EMPTY"
      );
    }

    const orderCode = "ORD-" + Date.now();

    const normalizedSnapPhone =
      normalizePhone(snap.customer_phone || snap.phone || snap.order_data?.customer_phone || "");

    const normalizedPaymentPhone =
      normalizePhone(payment.customer_phone || "");

    const normalizedUserPhone =
      String(payment.user_id || "").startsWith("guest-")
        ? ""
        : normalizePhone(payment.user_id || "");

    const finalCustomerPhone =
      normalizedSnapPhone ||
      normalizedPaymentPhone ||
      normalizedUserPhone ||
      "";

    // FIX: include latitude, longitude, address_detail từ cart_snapshot
    const {
      data: insertedOrder,
      error: orderErr,
    } = await supabase
      .from("orders")
      .insert({
        order_code:             orderCode,
        user_id:                finalCustomerPhone || payment.user_id,
        customer_name:          snap.customer_name    || payment.customer_name    || "Khách hàng",
        customer_phone:         finalCustomerPhone,
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
        // Địa chỉ giao hàng + loại đơn
        shipping_address:       snap.shipping_address || "",
        order_type:             snap.order_type || (String(snap.shipping_address || "").trim() ? "delivery" : "pickup"),
        note:                   snap.note || snap.customer_note || "",
        // FIX: toạ độ và chi tiết địa chỉ để iPOS build đúng payload DELI
        // latitude/longitude: removed - columns không tồn tại trong orders table
        // address_detail: removed - column không tồn tại trong orders table
      })
      .select()
      .single();

    let order =
      insertedOrder;

    if (orderErr) {
      /*
       * Under the durable UNIQUE(payment_transaction_id) fence,
       * a concurrent winner may have inserted the canonical order.
       * Resolve that order rather than creating or pretending a
       * second completion.
       */
      if (
        String(orderErr.code || "") ===
          "23505"
      ) {
        const concurrentOrder =
          await findDurableOrderForPayment(
            payment
          );

        if (!concurrentOrder) {
          throw commerceCompletionError(
            "COMMERCE_ORDER_UNIQUE_CONFLICT_UNRESOLVED",
            orderErr.message
          );
        }

        return buildCompletionResult({
          payment,
          order:
            concurrentOrder,
          replayed:
            true,
        });
      }

      throw commerceCompletionError(
        "COMMERCE_ORDER_CREATE_FAILED",
        orderErr.message
      );
    }

    if (
      !order?.id ||
      String(
        order.payment_transaction_id
      ) !==
        String(payment.id)
    ) {
      throw commerceCompletionError(
        "COMMERCE_ORDER_CREATE_RESULT_INVALID"
      );
    }

    console.log(
      "[COMMERCE] Durable order created:",
      order.order_code
    );

    const {
      error: paymentProjectionError,
    } = await supabase
      .from(
        "payment_transactions"
      )
      .update({
        order_created:
          true,
        order_id:
          order.id,
      })
      .eq(
        "id",
        payment.id
      );

    if (paymentProjectionError) {
      /*
       * The order itself is already durable and uniquely linked.
       * Do not create another order. Surface the projection fault;
       * replay resolves by payment_transaction_id and heals it.
       */
      throw commerceCompletionError(
        "COMMERCE_COMPLETION_PAYMENT_PROJECTION_FAILED",
        paymentProjectionError.message
      );
    }

    payment.order_created =
      true;

    payment.order_id =
      order.id;

    // spending_synced sẽ được đánh dấu sau khi instant spending xử lý xong.

    // Resolve phone từ customer_phone — dùng xuyên suốt thay vì UUID
    const resolvedPhone = normalizePhone(order.customer_phone);

    // ─── 0. Emit payment.success realtime → frontend navigate ngay ──
    try {
      const { realtimeEventBus } = require("../realtime/realtimeEventBus");
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

    // ─── 1. Push lên iPOS ngay sau khi thanh toán thành công ───────
    // iPOS sẽ được cấu hình mở cửa 24/24, nên không delay đơn ngoài giờ.
    const nowVN = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    const hourVN = nowVN.getHours();
    const isAfterHours = hourVN >= 23 || hourVN < 8;
    const afterHoursNote = isAfterHours
      ? "[ĐẶT NGOÀI GIỜ] Khách đã thanh toán online. Vui lòng xử lý theo vận hành cửa hàng."
      : "";

    try {
      const orderWithMeta = {
        ...order,
        order_type: snap.order_type || (snap.shipping_address ? "DELI" : "STORE"),
        note: [snap.note || snap.customer_note || "", afterHoursNote].filter(Boolean).join(" | "),
        payment_method:
          order.payment_method ||
          payment.payment_method ||
          "momo",
      };

      const iposResult = await pushOrderToIPOS({
        order: orderWithMeta,
        transaction_code: orderId,
        momo_trans_id:
          payment.payment_method ===
            "momo"
            ? String(
                transId || ""
              )
            : "",
      });

      if (iposResult.success) {
        console.log("[MOMO IPN] Pushed to iPOS OK:", order.order_code);
      } else {
        console.error("[MOMO IPN] iPOS push failed:", iposResult.error);
      }
    } catch (e) {
      console.error("[MOMO IPN] iPOS push exception:", e.message);
    }

    // ─── 1b. Thông báo đặc biệt nếu sau 23:00 ─────────────────────
    if (isAfterHours) {
      try {
        const { sendNotification } = require("../notificationService");
        const playerPhone = normalizePhone(order.customer_phone);
        const afterHoursMessage = "Đơn hàng đã thanh toán thành công. Hiện nay cửa hàng đang đóng cửa, chúng mình sẽ liên hệ với bạn vào 8 giờ sáng để trả hàng.";

        if (playerPhone) {
          await sendNotification({
            user_id: playerPhone,
            template_key: "CAMPAIGN_BROADCAST",
            custom: {
              title: "✅ Thanh toán thành công!",
              message: afterHoursMessage,
            },
            data: {
              order_id: order.id,
              order_code: order.order_code,
              reason: "after_hours_paid_order",
            },
          });
        }

        const { realtimeEventBus } = require("../realtime/realtimeEventBus");
        realtimeEventBus.publish({
          event: "notification.broadcast",
          delivery_type: "ROOM",
          room: `member:${playerPhone}`,
          payload: {
            notification: {
              title: "🌙 Đơn hàng ngoài giờ",
              message: afterHoursMessage,
              type: "payment_after_hours",
              created_at: new Date().toISOString(),
            },
            ticker: {
              enabled: true,
              message: afterHoursMessage,
            },
          },
          channel: "notification",
          timestamp: new Date().toISOString(),
        });

        console.log("[MOMO IPN] After-hours notification + ticker sent to", playerPhone);
      } catch (e) {
        console.warn("[MOMO IPN] After-hours notification failed:", e.message);
      }
    }

    // ─── 2. Daily missions ─────────────────────────────────────────
    try {
      const { checkOrderMissions } = require("../dailyMissionService");
      await checkOrderMissions(resolvedPhone || order.customer_phone, order.total_amount);
    } catch (e) {
      console.warn("[MOMO IPN] Mission check failed:", e.message);
    }

    // ─── 3. Partner monthly spending ───────────────────────────────
    // Trước 23h và từ 8h trở đi: CRM sync cập nhật tiến độ đối tác.
    // Từ 23h đến trước 8h: App cập nhật ngay để user thấy tiến độ realtime.
    if (isAfterHours) {
      try {
        const { updatePartnerMonthlySpending } = require("../partnerProgressService");
        await updatePartnerMonthlySpending({
          user_id: resolvedPhone || order.customer_phone,
          amount: order.total_amount || 0,
        });
      } catch (e) {
        console.warn("[MOMO IPN] Partner spending failed:", e.message);
      }
    } else {
      console.log("[MOMO IPN] Skip partner progress before 23h; CRM sync owns partner progress:", order.order_code);
    }

    // ─── 3a. Game plays by order — chạy 24/7, không phụ thuộc CRM/after-hours ───
    try {
      await awardGamePlaysForPaidOrder({
        phone: resolvedPhone || order.customer_phone,
        order,
      });
    } catch (e) {
      console.warn("[MOMO IPN] Order game plays failed:", e.message);
    }

    // ─── 3b. Instant spending sync vào players table ───────────────
    // Trước 23h: CRM/iPOS là nguồn chính, app không tự ghi chi tiêu.
    // Sau 23h: app chủ động ghi chi tiêu + lượt chơi ngay, rồi đánh dấu spending_synced.
    if (isAfterHours) {
      try {
      const phone = resolvedPhone || order.customer_phone;
      const amount = order.total_amount || 0;
      const nowVNStr = new Date().toLocaleDateString("en-CA", { timeZone:"Asia/Ho_Chi_Minh" });

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

      // Lấy spending hiện tại
      const { data: player } = await supabase.from("players")
        .select("crm_spend_weekly, crm_spend_monthly, crm_spend_yearly, crm_spend_alltime, crm_spend_custom")
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
          crm_synced_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        console.log(`[MOMO IPN] New player instant spending +${amount} for ${phone}`);
      }
      if (player) {

        const newWeekly   = Number(player.crm_spend_weekly   || 0) + amount;
        const newMonthly  = Number(player.crm_spend_monthly  || 0) + amount;
        const newYearly   = Number(player.crm_spend_yearly   || 0) + amount;
        const newAlltime  = Number(player.crm_spend_alltime  || 0) + amount;

        const updateData = {
          crm_spend_weekly:  newWeekly,
          crm_spend_monthly: newMonthly,
          crm_spend_yearly:  newYearly,
          crm_spend_alltime: newAlltime,
          crm_spend_custom:
         Number(player.crm_spend_custom || 0) + customSpendIncrement,
        };

        const { data: updated, error: updateErr } = await supabase.from("players")
          .update(updateData).eq("user_id", phone).select("crm_spend_alltime");
        if (updateErr) console.warn("[MOMO IPN] Player update error:", updateErr.message);

        // Đánh dấu đơn đã sync spending
        await supabase.from("orders").update({ spending_synced: true }).eq("id", order.id);

        console.log(`[MOMO IPN] Instant spending +${amount} for ${phone} | week:${newWeekly} month:${newMonthly} alltime:${newAlltime}`);

        try {
          const io = req.app.get("io") || global._ioInstance || global.io;
          if (io) {
            const { checkAndNotifyTop1Changes } = require("../leaderboardResetService");
            await checkAndNotifyTop1Changes(io);
          }
        } catch(e) {
          console.warn("[MOMO IPN] Top1 check failed:", e.message);
        }

        // Realtime BXH tiêu dùng — append-only side effect.
        // Tuyệt đối không thay đổi payment/order/spending flow.
        // Nếu realtime lỗi thì chỉ log warning, không throw, không return, không ảnh hưởng payment.
        try {
          const { emitSpendingLeaderboardUpdates } = require("../spendingLeaderboardRealtimeService");

          const realtimePeriods = ["weekly", "monthly", "yearly", "alltime"];
          if (customSpendIncrement > 0) realtimePeriods.push("custom");

          await emitSpendingLeaderboardUpdates({
            periods: realtimePeriods,
            updatedUser: { user_id: phone },
            amountAdded: amount,
            reason: "momo_after_hours_spending_changed",
          });
        } catch(e) {
          console.warn("[MOMO IPN] Spending leaderboard realtime failed:", e.message);
        }
      }
      } catch (e) {
        console.warn("[MOMO IPN] Instant spending failed:", e.message);
      }
    } else {
      console.log("[MOMO IPN] Skip local spending before 23h; CRM/iPOS owns spending:", order.order_code);
    }

    // ─── 4. Trừ điểm nếu dùng điểm ────────────────────────────────
    const pointsUsed = snap.points_used || 0;
    if (pointsUsed > 0) {
      try {
        const { deductPoints } = require("../loyaltyPointService");
        await deductPoints({
          phone:   resolvedPhone,
          user_id: resolvedPhone,
          points:  pointsUsed,
          reason:  "Thanh toán đơn hàng " + order.order_code,
        });
        console.log("[MOMO IPN] Deducted", pointsUsed, "points");
      } catch (e) {
        console.warn("[MOMO IPN] Point deduction failed:", e.message);
      }
    }

    // ─── 5. Cộng điểm theo tier ────────────────────────────────────
    // Trước 23h: iPOS/CRM tự cộng điểm đơn online, app chỉ đọc lại.
    // Sau 23h: app cộng local ngay để user thấy điểm tức thì,
    // nhưng KHÔNG gọi update_point ADD riêng sang iPOS vì iPOS đã tự ghi điểm theo đơn online.
    if (isAfterHours) {
      try {
        const { addPoints } = require("../loyaltyPointService");
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
            order_id: order.id,
            syncIpos: false,
            metadata: {
              source: "after_hours_app_order",
              order_code: order.order_code,
              tier: tierKey,
            },
          });
          console.log("[MOMO IPN] Added after-hours local points", pointsToAdd, "for", order.user_id, "tier:", tierKey);
        }
      } catch (e) {
        console.warn("[MOMO IPN] Point addition failed:", e.message);
      }
    } else {
      console.log("[MOMO IPN] Skip local order points before 23h; CRM/iPOS owns points:", order.order_code);
    }

    // ─── 5b. Trước 23h sync từ CRM/iPOS; sau 23h app đã instant sync ────────

    // ─── 6. Thông báo ──────────────────────────────────────────────
    try {
      const { sendNotification } = require("../notificationService");
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
      const { realtimeEventBus } = require("../realtime/realtimeEventBus");
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

    /*
     * All critical commerce completion work above has produced a
     * durable uniquely-linked order. Downstream business effects
     * remain independently best-effort/recoverable at this V1
     * checkpoint.
     */
    return buildCompletionResult({
      payment,
      order,
      replayed:
        false,
    });

  } catch (err) {
    console.error(
      "[COMMERCE] Paid-order completion failed:",
      err.message
    );

    throw err;

  } finally {
    if (
      lockAcquired &&
      lockKey
    ) {
      await redisClient
        .del(lockKey)
        .catch(
          () => {}
        );
    }
  }

}

module.exports = {
  processPaidOrderSettlement,
};
