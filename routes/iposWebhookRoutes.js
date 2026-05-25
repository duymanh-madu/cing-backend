const express = require("express");
const router = express.Router();
const redisClient = require("../services/infrastructure/cache/redisClient");
const redisPublisher = require("../services/infrastructure/cache/redisPublisher");
const { getMember } = require("../services/foodbook");

const IPOS_WEBHOOK_SECRET = process.env.IPOS_WEBHOOK_SECRET || "";

/**
 * POST /webhook/ipos/member-updated
 * iPOS goi khi: cap nhat hang, tich diem, doi diem
 */
router.post("/member-updated", async (req, res) => {
  try {
    // Verify secret neu co
    const secret = req.headers["x-webhook-secret"] || req.query.secret;
    if (IPOS_WEBHOOK_SECRET && secret !== IPOS_WEBHOOK_SECRET) {
      return res.status(401).json({ success: false, message: "Invalid secret" });
    }

    const { phone_number, user_id, event_type } = req.body;
    const phone = String(phone_number || user_id || "").replace(/\D/g, "");

    if (!phone) {
      return res.status(400).json({ success: false, message: "Missing phone" });
    }

    console.log(`[IPOS WEBHOOK] ${event_type} for phone: ${phone}`);

    // 1. Xoa cache cu
    await redisClient.del(`membership:${phone}`);

    // 2. Fetch data moi tu iPOS
    const result = await getMember(phone);
    if (result.success && result.data?.data) {
      const d = result.data.data;
      const memberData = {
        id: d.id,
        phone: String(d.phone_number),
        name: d.name,
        tierKey: mapTierKey(d.membership_type_name),
        tierName: d.membership_type_name,
        points: Math.floor(d.point || 0),
        pointAmount: d.point_amount || 0,
        paymentAmount: d.payment_amount || 0,
        eatTimes: d.eat_times || 0,
        tags: d.tags || [],
        updatedAt: Date.now(),
      };

      // 3. Luu vao Redis cache 10 phut
      await redisClient.setex(
        `membership:${phone}`,
        600,
        JSON.stringify(memberData)
      );

      // 4. Push realtime qua Redis pub/sub -> Socket.IO
      await redisPublisher.publish("realtime:events", JSON.stringify({
        event: "membership:updated",
        payload: { phone, data: memberData },
        room: `user:${phone}`,
      }));

      console.log(`[IPOS WEBHOOK] Cache updated + pushed for ${phone}`);
    }

    return res.json({ success: true, message: "Processed" });
  } catch (err) {
    console.error("[IPOS WEBHOOK] Error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /webhook/ipos/order-completed
 * iPOS goi khi don hang hoan thanh - cap nhat diem
 */
router.post("/order-completed", async (req, res) => {
  try {
    const { phone_number } = req.body;
    const phone = String(phone_number || "").replace(/\D/g, "");
    if (phone) {
      // Xoa cache -> next fetch se lay data moi
      await redisClient.del(`membership:${phone}`);
      console.log(`[IPOS WEBHOOK] Order completed - cache cleared for ${phone}`);
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

function mapTierKey(name) {
  if (!name) return "member";
  const n = name.toLowerCase();
  if (n.includes("kim") && (n.includes("cuong") || n.includes("cương"))) return "diamond";
  if (n.includes("vàng") || n.includes("vang")) return "gold";
  if (n.includes("bạc") || n.includes("bac")) return "silver";
  if (n.includes("thân thiết") || n.includes("than thiet")) return "loyal";
  if (n.includes("đối tác thân thiết")) return "loyal_partner";
  if (n.includes("đối tác") || n.includes("doi tac")) return "partner";
  return "member";
}


/**
 * POST /webhook/ipos/test
 * Dung de capture format callback tu Foodbook
 */
router.post("/test", async (req, res) => {
  console.log("[FOODBOOK CALLBACK] Headers:", JSON.stringify(req.headers, null, 2));
  console.log("[FOODBOOK CALLBACK] Body:", JSON.stringify(req.body, null, 2));
  // Luu vao Redis de xem sau
  try {
    await redisClient.setex(
      "foodbook:last_callback",
      3600,
      JSON.stringify({ headers: req.headers, body: req.body, ts: Date.now() })
    );
  } catch(e) {}
  return res.json({ success: true, received: true });
});

/**
 * GET /webhook/ipos/last-callback
 * Xem callback cuoi cung tu Foodbook
 */
router.get("/last-callback", async (req, res) => {
  const data = await redisClient.get("foodbook:last_callback");
  return res.json({ data: data ? JSON.parse(data) : null });
});

module.exports = router;
