const express = require("express");
const router = express.Router();
const { getMember, getMemberVouchers } = require("../services/foodbook");

// GET /api/membership/:phone
router.get("/:phone", async (req, res) => {
  try {
    const { phone } = req.params;
    if (!phone) return res.status(400).json({ success: false, message: "Thiếu phone" });

    const result = await getMember(phone);
    if (!result.success) {
      return res.status(404).json({ success: false, message: "Không tìm thấy thành viên" });
    }

    const d = result.data?.data;
    if (!d) return res.status(404).json({ success: false, message: "Không có data" });

    // Map sang format chuẩn cho frontend
    return res.json({
      success: true,
      data: {
        id:             d.id,
        phone:          String(d.phone_number),
        name:           d.name,
        tierKey:        mapTierKey(d.membership_type_name),
        tierName:       d.membership_type_name,
        points:         Math.floor(d.point || 0),
        pointAmount:    d.point_amount || 0,
        paymentAmount:  d.payment_amount || 0,
        eatTimes:       d.eat_times || 0,
        firstVisit:     d.first_eat_date,
        lastVisit:      d.last_eat_date,
        birthday:       d.birthday,
        zaloId:         d.zalo_id,
        isZaloFollow:   d.is_zalo_follow === 1,
        city:           d.city_name,
        tags:           d.tags || [],
      }
    });
  } catch (err) {
    console.error("membership route error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/membership/:phone/vouchers
router.get("/:phone/vouchers", async (req, res) => {
  try {
    const result = await getMemberVouchers(req.params.phone);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

function mapTierKey(name) {
  if (!name) return "member";
  const n = name.toLowerCase();
  if (n.includes("kim cương") || n.includes("kim cuong") || n.includes("diamond")) return "diamond";
  if (n.includes("vàng") || n.includes("vang") || n.includes("gold")) return "gold";
  if (n.includes("bạc") || n.includes("bac") || n.includes("silver")) return "silver";
  if (n.includes("thân thiết") || n.includes("than thiet")) return "loyal";
  if (n.includes("đối tác thân thiết")) return "loyal_partner";
  if (n.includes("đối tác") || n.includes("doi tac")) return "partner";
  return "member";
}

module.exports = router;
