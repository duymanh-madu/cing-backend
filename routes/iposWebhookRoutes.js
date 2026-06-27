const express = require("express");
const supabase = require("../supabase");
const router = express.Router();
const redisClient = require("../services/infrastructure/cache/redisClient");
const redisPublisher = require("../services/infrastructure/cache/redisPublisher");
const { realtimeEventBus } = require("../services/realtime/realtimeEventBus");
const { getMember } = require("../services/foodbook");
const { syncSingleUserSpending } = require("../services/crm/crmSpendingSyncService");

const IPOS_WEBHOOK_SECRET = process.env.IPOS_WEBHOOK_SECRET || "";

// Chuyển đổi đầu số cũ sang đầu số mới (theo quy định Bộ TT&TT)
function normalizePhone(phone) {
  if (!phone) return "";
  let p = String(phone).replace(/\D/g, "");
  // Bỏ prefix 84
  if (p.startsWith("84")) p = "0" + p.slice(2);
  // Map đầu số cũ → mới
  const map = {
    "0162":"032","0163":"033","0164":"034","0165":"035","0166":"036","0167":"037","0168":"038","0169":"039",
    "0120":"070","0121":"079","0122":"077","0126":"076","0128":"078",
    "0123":"083","0124":"084","0125":"085","0127":"081","0129":"082",
    "0186":"056","0188":"058","0199":"059",
  };
  const prefix4 = p.slice(0, 4);
  if (map[prefix4]) p = map[prefix4] + p.slice(4);
  return p;
}

function mapTierKey(name) {
  if (!name) return "member";
  const n = name.toLowerCase().trim();
  if (n === "dttt")                   return "loyal_partner";
  if (n === "dt")                     return "partner";
  if (n === "hvkc")                   return "diamond";
  if (n === "hvv")                    return "gold";
  if (n === "hvb")                    return "silver";
  if (n === "hvtt")                   return "loyal";
  if (n === "foodbook" || n === "hv") return "member";
  if (n.includes("kim") && (n.includes("cuong") || n.includes("cương"))) return "diamond";
  if (n.includes("vàng") || n.includes("vang")) return "gold";
  if (n.includes("bạc")  || n.includes("bac"))  return "silver";
  const hasDoiTac    = n.includes("đối tác")   || n.includes("doi tac");
  const hasThanThiet = n.includes("thân thiết") || n.includes("than thiet");
  if (hasDoiTac && hasThanThiet)  return "loyal_partner";
  if (hasThanThiet && !hasDoiTac) return "loyal";
  if (hasDoiTac && !hasThanThiet) return "partner";
  return "member";
}

/**
 * POST /webhook/ipos/callback
 * Unified endpoint - iPos push về khi có giao dịch mới
 */
async function clearMomoPaidCrmRecoveryJob(phone, event) {
  if (event !== "membership_log") return;

  const uid = String(phone || "").trim();
  if (!uid) return;

  const { data, error } = await supabase
    .from("crm_sync_queue")
    .update({
      status: "done",
      processed_at: new Date().toISOString(),
      locked_until: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("source", "momo_paid")
    .in("status", ["pending", "processing"])
    .or(`phone.eq.${uid},user_id.eq.${uid}`)
    .select("id");

  if (error) {
    console.warn("[CRM RECOVERY] clear momo_paid job failed:", error.message);
    return;
  }

  if (data && data.length > 0) {
    console.log("[CRM RECOVERY] cleared momo_paid job after membership_log sync", {
      phone: uid,
      cleared: data.length,
    });
  }
}


async function awardOrderGamePlays({ user_id, order_code, amount }) {
  const phone = normalizePhone(user_id || "");
  const orderCode = String(order_code || "").trim();
  const totalAmount = Number(amount || 0);

  if (!phone || !orderCode || totalAmount <= 0) {
    return { success: false, skipped: true, reason: "invalid_input" };
  }

  const { data: existingLog } = await supabase
    .from("analytics_events")
    .select("id")
    .eq("user_id", phone)
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

  const spendPerPlay = await supabase
    .from("app_configs")
    .select("spend_per_play")
    .eq("id", 1)
    .single()
    .then(r => Number(r.data?.spend_per_play || 20000))
    .catch(() => 20000);

  const playsToAdd = Math.floor(totalAmount / (spendPerPlay || 20000));

  if (playsToAdd <= 0) {
    return { success: true, skipped: true, reason: "below_threshold", order_code: orderCode };
  }

  const { data: player } = await supabase
    .from("players")
    .select("game_plays, plays_from_spend")
    .eq("user_id", phone)
    .maybeSingle();

  const currentPlays = Number(player?.game_plays || 0);
  const newTotal = currentPlays + playsToAdd;

  const { addPlays } = require("../services/loyaltyPointService");

  await addPlays({
    user_id: phone,
    amount: playsToAdd,
    reason: `Tiêu dùng ${totalAmount.toLocaleString("vi-VN")}đ — đơn ${orderCode}`,
    new_total: newTotal,
    metadata: {
      source: "order_spending",
      order_code: orderCode,
      order_amount: totalAmount,
      spend_per_play: spendPerPlay,
    },
  });

  await supabase
    .from("players")
    .update({
      game_plays: newTotal,
      plays_from_spend: Number(player?.plays_from_spend || 0) + playsToAdd,
    })
    .eq("user_id", phone);

  console.log(`[GAME] Order spend bonus: +${playsToAdd} plays for ${phone} | ${orderCode} | amount=${totalAmount}`);
  return { success: true, plays: playsToAdd, order_code: orderCode };
}

function extractIposOrderAmount(orderData) {
  if (!orderData) return 0;

  const direct =
    orderData.total_amount ||
    orderData.payment_amount ||
    orderData.total_money ||
    orderData.money ||
    orderData.amount ||
    orderData.grand_total ||
    orderData.final_amount ||
    0;

  if (Number(direct || 0) > 0) return Number(direct || 0);

  const items = orderData.order_data_item || orderData.items || [];
  if (Array.isArray(items)) {
    return items.reduce((sum, item) => {
      const price = Number(item.Price || item.price || item.unit_price || 0);
      const qty = Number(item.Quantity || item.quantity || item.qty || 1);
      return sum + price * qty;
    }, 0);
  }

  return 0;
}


router.post("/callback", async (req, res) => {
  try {
    const body  = req.body || {};
    const event = body.event || "unknown";

    console.log(`[FOODBOOK] Event: ${event}`, JSON.stringify(body).slice(0, 200));

    // Lưu last callback để debug
    await redisClient.setex("foodbook:last_callback", 3600,
      JSON.stringify({ headers: req.headers, body, ts: Date.now() }));

    // Trả về 200 ngay — không để iPos timeout
    res.json({ success: true });

    /**
     * =====================================================
     * MENU REALTIME EVENTS
     * =====================================================
     * Event 12: item_changed -> refresh full menu from iPOS
     * Event 26: item_out_of_stock -> refresh menu/status immediately
     */
    if (event === "item_changed" || event === "item_out_of_stock") {
      try {
        const {
          refreshMenuFromIPOS,
        } = require("../services/menu/menuSyncService");

        const result =
          await refreshMenuFromIPOS({
            reason: `ipos_webhook:${event}`,
            eventPayload: body,
          });

        console.log("[MENU] iPOS webhook sync result:", {
          event,
          success: result.success,
          count: result.count,
          menuType: result.menuType,
          reason: result.reason || null,
        });
      } catch (e) {
        console.warn(
          "[MENU] iPOS webhook sync failed:",
          e.message
        );
      }
    }

    // Idempotency check — dùng id riêng của từng giao dịch (object.id), không phải event_id cố định
    // event_id (10, 11, 3...) chỉ là LOẠI event, không phải định danh giao dịch
    const eventData = body[event] || {};
    const uniqueId = eventData.id || body.event_id || body.id;
    if (uniqueId) {
      const lockKey = `ipos:event:${event}:${uniqueId}`;
      const locked = await redisClient.set(lockKey, '1', 'NX', 'EX', 300).catch(() => null);
      if (!locked) {
        console.log(`[FOODBOOK] Duplicate event skipped: ${event} #${uniqueId}`);
        const hourKey = `ipos:dedup_skip:${new Date().toISOString().slice(0,13)}`;
        await redisClient.incr(hourKey).catch(()=>{});
        await redisClient.expire(hourKey, 7200).catch(()=>{});
        return;
      }
    }

    // Xử lý async sau khi đã trả response
    let phone = "";
    if (body.membership_log?.membership_id) {
      phone = normalizePhone(String(body.membership_log.membership_id));
    } else if (body.sale_manager?.member_id) {
      phone = normalizePhone(String(body.sale_manager.member_id));
    } else if (body.sale_manager?.phone_number) {
      phone = normalizePhone(String(body.sale_manager.phone_number));
    } else if (body.order?.phone_number) {
      phone = normalizePhone(String(body.order.phone_number));
    } else if (body.phone_number) {
      phone = normalizePhone(String(body.phone_number));
    }

    if (!phone) return;

    // 1. Xóa Redis cache
    const p0  = normalizePhone(phone);
    const p84 = "84" + p0.slice(1);

    // Ghi log event để theo dõi đồng bộ — dùng cho ipos_activity health check
    let _logId = null;
    try {
      const _foodbookCode = (body.notify_order_online || body.sale_manager || body.membership_log)?.foodbook_code || null;
      const { data: logRow } = await supabase.from("ipos_webhook_log").insert({
        event, unique_id: uniqueId, phone: p0 || null, foodbook_code: _foodbookCode,
        synced: false,
      }).select("id").maybeSingle();
      _logId = logRow?.id || null;
    } catch(e) { console.warn("[FOODBOOK] log insert failed:", e.message); }
    await Promise.all([
      redisClient.del(`membership:${p84}`),
      redisClient.del(`membership:${p0}`),
      redisClient.del(`membership:${phone}`),
    ]);

    // 2. Fetch data mới từ iPos
    const result = await getMember(phone);
    if (result.success && result.data?.data) {
      const d = result.data.data;
      const memberData = {
        id:            d.id,
        phone:         p0,
        name:          d.name,
        tierKey:       mapTierKey(d.membership_type_name),
        tierName:      d.membership_type_name,
        points:        Math.floor(d.point || 0),
        pointAmount:   d.point_amount || 0,
        paymentAmount: d.payment_amount || 0,
        eatTimes:      d.eat_times || 0,
        tags:          d.tags || [],
        updatedAt:     Date.now(),
      };

      // 3. Đồng bộ total_points từ CRM → DB
      // CRM/iPOS là nguồn điểm thật cho giao dịch tại quầy.
      // App history đọc analytics_events, nên khi điểm CRM tăng phải ghi points_added event idempotent.
      try {
        const orderDataForPointSource = body.notify_order_online || body.sale_manager || body.membership_log;
        const foodbookCodeForPointSource = orderDataForPointSource?.foodbook_code;
        const amountForPointSource = extractIposOrderAmount(orderDataForPointSource);
        const directOrderCodeForPointSource = foodbookCodeForPointSource
          ? "ORD-" + foodbookCodeForPointSource
          : event === "membership_log" && uniqueId
            ? "IPOS-MEMBERSHIP-" + uniqueId
            : "";

        let skipPointOverwrite = false;

        if (foodbookCodeForPointSource) {
          const { data: existingOrder } = await supabase
            .from("orders")
            .select("spending_synced")
            .eq("order_code", "ORD-" + foodbookCodeForPointSource)
            .maybeSingle();

          skipPointOverwrite = existingOrder?.spending_synced === true;
        }

        const { data: localPlayer } = await supabase
          .from("players")
          .select("total_points")
          .eq("user_id", p0)
          .maybeSingle();

        const localPoints = Number(localPlayer?.total_points || 0);

        if (skipPointOverwrite) {
          memberData.points = localPoints;
          console.log(`[IPOS WEBHOOK] Skip point overwrite for after-hours app order ${foodbookCodeForPointSource} / ${p0}`);
        } else {
          const crmPoints = Math.floor(d.point || 0);
          const pointsDelta = crmPoints - localPoints;

          if (pointsDelta > 0 && directOrderCodeForPointSource) {
            const { error: pointHistoryErr } = await supabase
              .from("analytics_events")
              .insert({
                event_name: "points_added",
                user_id: p0,
                event_data: {
                  amount: pointsDelta,
                  reason: `Tích điểm đơn tại quầy iPOS — đơn ${directOrderCodeForPointSource}`,
                  source: foodbookCodeForPointSource ? "ipos_order" : "ipos_membership_log",
                  order_code: directOrderCodeForPointSource,
                  order_amount: amountForPointSource,
                  new_total: crmPoints,
                },
                created_at: new Date().toISOString(),
              });

            if (pointHistoryErr && pointHistoryErr.code !== "23505") {
              console.warn("[IPOS WEBHOOK] points history insert failed:", pointHistoryErr.message);
            } else if (!pointHistoryErr) {
              console.log("[IPOS WEBHOOK] points history added:", {
                phone: p0,
                order_code: directOrderCodeForPointSource,
                points: pointsDelta,
                new_total: crmPoints,
              });
            }
          }

          await supabase.from("players")
            .update({ total_points: crmPoints })
            .eq("user_id", p0);

          await supabase.from("point_balance_baselines")
            .update({ baseline_points: crmPoints, baseline_at: new Date().toISOString() })
            .eq("user_id", p0);
        }
      } catch(e) { console.warn("[IPOS WEBHOOK] total_points sync failed:", e.message); }

      // 3b. Lưu Redis cache mới
      await redisClient.setex(`membership:${p0}`, 600, JSON.stringify(memberData));

      // 4. Push realtime Socket.IO
      realtimeEventBus.publish({
        event:         "user.updated",
        delivery_type: "BROADCAST",
        payload:       { phone: p0, data: memberData },
        channel:       "membership",
        timestamp:     new Date().toISOString(),
      });

      // 5. Sync spending — chỉ skip nếu đơn app đã được instant sync rồi
      // Đơn tại quầy không có record spending_synced=true nên luôn được sync
      try {
        let skipSync = false;
        const orderData = body.notify_order_online || body.sale_manager || body.membership_log;
        const foodbookCode = orderData?.foodbook_code;

        if (foodbookCode) {
          const { data: existingOrder } = await supabase
            .from("orders")
            .select("spending_synced")
            .eq("order_code", "ORD-" + foodbookCode)
            .maybeSingle();
          if (existingOrder?.spending_synced === true) {
            skipSync = true;
            console.log(`[FOODBOOK] Skip: đơn app ${foodbookCode} đã sync rồi cho ${p0}`);
          }
        }

        if (!skipSync) {
          await syncSingleUserSpending(p0);
          console.log(`[FOODBOOK] Spending synced for ${p0} - event: ${event}`);
        }

        const orderForPlays = body.notify_order_online || body.sale_manager || body.membership_log;
        const foodbookCodeForPlays = orderForPlays?.foodbook_code;
        const amountForPlays = extractIposOrderAmount(orderForPlays);

        const directOrderCodeForPlays = foodbookCodeForPlays
          ? "ORD-" + foodbookCodeForPlays
          : event === "membership_log" && uniqueId
            ? "IPOS-MEMBERSHIP-" + uniqueId
            : "";

        if (directOrderCodeForPlays) {
          if (!foodbookCodeForPlays && event === "membership_log" && amountForPlays > 0) {
            try {
              const { error: upsertFallbackOrderErr } = await supabase
                .from("crm_orders")
                .upsert({
                  order_code: directOrderCodeForPlays,
                  user_id: p0,
                  order_amount: amountForPlays,
                  processed: true,
                  source: "ipos_membership_log",
                }, {
                  onConflict: "user_id,order_code",
                  ignoreDuplicates: true,
                });

              if (upsertFallbackOrderErr) {
                console.warn("[GAME] iPOS fallback crm_orders upsert failed:", upsertFallbackOrderErr.message);
              } else {
                console.log("[GAME] iPOS fallback crm_orders ensured:", {
                  phone: p0,
                  order_code: directOrderCodeForPlays,
                  amount: amountForPlays,
                });
              }
            } catch (e) {
              console.warn("[GAME] iPOS fallback crm_orders persist failed:", p0, e.message);
            }
          }

          await awardOrderGamePlays({
            user_id: p0,
            order_code: directOrderCodeForPlays,
            amount: amountForPlays,
          }).catch(e => console.warn("[GAME] Order spend bonus failed:", e.message));
        } else {
          console.log("[GAME] Direct iPOS order play award skipped: missing order identity", {
            phone: p0,
            event,
            uniqueId,
            amount: amountForPlays,
            has_foodbook_code: Boolean(foodbookCodeForPlays),
          });
        }
        // Nếu iPOS membership_log đã sync hoặc xác nhận đơn app đã sync,
        // dọn job CRM recovery dự phòng từ MoMo để tránh recovery tick sync lại cùng dữ liệu.
        await clearMomoPaidCrmRecoveryJob(p0, event);

        // Đánh dấu log đã sync (kể cả skip vì đã sync từ MoMo)
        if (_logId) {
          await supabase.from("ipos_webhook_log").update({ synced: true }).eq("id", _logId).then(()=>{}).catch(()=>{});
        }
      } catch (syncErr) {
        console.warn(`[FOODBOOK] Spending sync failed for ${p0}:`, syncErr.message);
      }

      // 6. Check top1 thay đổi → notify realtime
      try {
        const { checkAndNotifyTop1Changes } = require('../services/leaderboardResetService');
        const io = require('../server').io || global._ioInstance;
        if (io) await checkAndNotifyTop1Changes(io);
      } catch(e) {
        console.warn('[FOODBOOK] checkAndNotifyTop1 failed:', e.message);
      }

      try {
        const { emitSpendingLeaderboardUpdates } = require("../services/spendingLeaderboardRealtimeService");

        await emitSpendingLeaderboardUpdates({
          periods: ["weekly", "monthly", "yearly", "alltime", "custom"],
          updatedUser: p0,
          reason: "ipos_spending_changed",
        });
      } catch(e) {
        console.warn("[IPOS WEBHOOK] Spending leaderboard realtime failed:", e.message);
      }
      console.log(`[FOODBOOK] Full sync done for ${p0} - event: ${event}`);
    }

  } catch (err) {
    console.error("[FOODBOOK CALLBACK] Error:", err.message);
  }
});

/**
 * POST /webhook/ipos/member-updated
 * Legacy endpoint — giữ lại để tương thích
 */
router.post("/member-updated", async (req, res) => {
  req.url = "/callback";
  router.handle(req, res, () => {});
});

/**
 * POST /webhook/ipos/order-completed
 * Legacy endpoint — giữ lại để tương thích
 */
router.post("/order-completed", async (req, res) => {
  req.url = "/callback";
  router.handle(req, res, () => {});
});

/**
 * POST /webhook/ipos/test
 * Capture raw format từ Foodbook để debug
 */
router.post("/test", async (req, res) => {
  console.log("[FOODBOOK TEST] Headers:", JSON.stringify(req.headers, null, 2));
  console.log("[FOODBOOK TEST] Body:", JSON.stringify(req.body, null, 2));
  try {
    await redisClient.setex("foodbook:last_callback", 3600,
      JSON.stringify({ headers: req.headers, body: req.body, ts: Date.now() }));
  } catch(e) {}
  return res.json({ success: true, received: true });
});

/**
 * GET /webhook/ipos/last-callback
 * Xem webhook cuối cùng từ Foodbook
 */
router.get("/last-callback", async (req, res) => {
  const data = await redisClient.get("foodbook:last_callback");
  return res.json({ data: data ? JSON.parse(data) : null });
});

/**
 * GET /webhook/ipos/test-update-point
 * Test trừ điểm từ Railway
 */
router.get("/test-update-point", async (req, res) => {
  try {
    const axios = require("axios");
    const params = new URLSearchParams();
    params.append("pos_parent",   process.env.IPOS_POS_PARENT);
    params.append("phone_number", "84984966336");
    params.append("type_change",  "MINUS");
    params.append("point_change", "1");
    params.append("note",         "Test tru diem tu app Railway");
    const result = await axios.post(
      "https://api.foodbook.vn/ipos/ws/partner/mbs/update_point",
      params,
      { headers: { access_token: process.env.IPOS_ACCESS_TOKEN } }
    );
    res.json({ success: true, data: result.data });
  } catch(e) {
    res.status(500).json({ success: false, error: e.response?.data || e.message });
  }
});

module.exports = router;