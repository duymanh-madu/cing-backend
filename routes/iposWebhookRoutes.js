const express = require("express");
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

    // Idempotency check — tránh xử lý double event từ iPOS
    const eventId = body.event_id || body.id;
    if (eventId) {
      const lockKey = `ipos:event:${eventId}`;
      const locked = await redisClient.set(lockKey, '1', 'NX', 'EX', 300).catch(() => null);
      if (!locked) {
        console.log(`[FOODBOOK] Duplicate event skipped: ${event} #${eventId}`);
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

      // 3. Lưu Redis cache mới
      await redisClient.setex(`membership:${p0}`, 600, JSON.stringify(memberData));

      // 4. Push realtime Socket.IO
      realtimeEventBus.publish({
        event:         "user.updated",
        delivery_type: "BROADCAST",
        payload:       { phone: p0, data: memberData },
        channel:       "membership",
        timestamp:     new Date().toISOString(),
      });

      // 5. Sync spending vào Supabase → leaderboard cập nhật ngay
      // Nếu đơn đã được instant sync từ MoMo IPN thì bỏ qua để tránh duplicate
      try {
        let skipSync = false;
        // foodbook_code có thể ở nhiều event khác nhau
        const foodbookCode = body.notify_order_online?.foodbook_code
          || body.sale_manager?.foodbook_code
          || body.membership_log?.foodbook_code;
        if (foodbookCode) {
          const { data: existingOrder } = await supabase
            .from("orders")
            .select("spending_synced")
            .eq("order_code", "ORD-" + foodbookCode)
            .maybeSingle();
          if (existingOrder?.spending_synced === true) {
            skipSync = true;
            console.log(`[FOODBOOK] Spending already synced by MoMo IPN, skip for ${p0}`);
          }
        }
        if (!skipSync) {
          await syncSingleUserSpending(p0);
          console.log(`[FOODBOOK] Spending synced for ${p0} - event: ${event}`);
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

      realtimeEventBus.publish({ event: "leaderboard.updated", delivery_type: "BROADCAST", payload: { updated_user: p0 }, channel: "leaderboard", timestamp: new Date().toISOString() });
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