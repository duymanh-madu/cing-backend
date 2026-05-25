const express = require("express");
const router = express.Router();
const redisClient = require("../services/infrastructure/cache/redisClient");
const { getMember, getMemberVouchers } = require("../services/foodbook");

const CACHE_TTL = 300; // 5 phut fallback TTL

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

// GET /api/membership/:phone
router.get("/:phone", async (req, res) => {
  try {
    const phone = (req.params.phone || "").replace(/\D/g, "");
    if (!phone) return res.status(400).json({ success: false, message: "Thiếu phone" });

    const cacheKey = `membership:${phone}`;

    // 1. Check Redis cache truoc
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      console.log(`[MEMBERSHIP] Cache HIT for ${phone}`);
      return res.json({ success: true, data, source: "cache" });
    }

    // 2. Cache miss - fetch tu iPOS
    console.log(`[MEMBERSHIP] Cache MISS for ${phone} - fetching iPOS`);
    const result = await getMember(phone);

    if (!result.success || !result.data?.data) {
      return res.status(404).json({ success: false, message: "Không tìm thấy thành viên" });
    }

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
      firstVisit: d.first_eat_date,
      lastVisit: d.last_eat_date,
      birthday: d.birthday,
      zaloId: d.zalo_id,
      isZaloFollow: d.is_zalo_follow === 1,
      city: d.city_name,
      tags: d.tags || [],
      updatedAt: Date.now(),
    };

    // 3. Luu vao Redis 5 phut
    await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(memberData));

    return res.json({ success: true, data: memberData, source: "ipos" });
  } catch (err) {
    console.error("membership route error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/membership/:phone/vouchers
router.get("/:phone/vouchers", async (req, res) => {
  try {
    const phone = (req.params.phone || "").replace(/\D/g, "");
    const cacheKey = `membership:vouchers:${phone}`;
    
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.json({ success: true, data: JSON.parse(cached), source: "cache" });

    const result = await getMemberVouchers(phone);
    if (result.success && result.data) {
      await redisClient.setex(cacheKey, 120, JSON.stringify(result.data));
    }
    return res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
