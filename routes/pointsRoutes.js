const { sendLegacyGamePlaysClosed } = require("../services/games/revival/cingLegacyGamePlaysCutoverGuard");
const express = require("express");
const router = express.Router();

const authMiddleware =
  require("../middlewares/authMiddleware");
const supabase = require("../supabase");
const { deductPoints } = require("../services/loyaltyPointService");

const { normalizePhone } = require("../utils/phoneIdentity");

// GET /api/points/:user_id
router.get("/:user_id", async (req, res) => {
  try {
    const { data } = await supabase
      .from("players")
      .select("game_plays, total_points")
      .eq("user_id", req.params.user_id)
      .maybeSingle();
    res.json({ success: true, data: { game_plays: data?.game_plays || 0, total_points: data?.total_points || 0 } });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/points/buy-plays
//
// Game Center V2 permanently rejects new conversion of
// loyalty points into the retired V1 play-count asset.
// Revive Credit purchases use the dedicated economy V2
// financial authority instead.
router.post("/buy-plays", async (req, res) => {
  return sendLegacyGamePlaysClosed(res);
});


// POST /api/points/deduct
router.post("/deduct", async (req, res) => {
  try {
    const { user_id, phone, points, reason } = req.body;
    if (!user_id || !points) return res.status(400).json({ success: false, message: "Thiếu thông tin" });
    const result = await deductPoints({ phone: phone || user_id, user_id, points, reason });
    res.json({ success: true, ...result });
  } catch(err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/points/pay-with-points — thanh toán đơn hàng bằng điểm + push iPOS
router.post(
  "/pay-with-points",
  authMiddleware,
  async (req, res) => {

    /*
     * Deprecated commerce mutation entrypoint.
     *
     * Point-funded and mixed-funded orders must enter through
     * POST /api/checkout/create, which owns:
     *
     * - canonical point value
     * - canonical usable-point limit
     * - durable point reservation
     * - payment transaction
     * - points/internal settlement
     * - shared commerce completion
     *
     * This endpoint intentionally performs zero mutation.
     */
    return res
      .status(410)
      .json({

        success: false,

        code:
          "COMMERCE_CHECKOUT_ENDPOINT_REQUIRED",

        error:
          "Thanh toán đơn hàng bằng điểm phải thực hiện qua checkout chuẩn",

        checkout_endpoint:
          "/api/checkout/create",

      });

  }
);



router.post("/exchange-voucher", async (req, res) => {
  try {
    const { user_id, phone, points } = req.body;
    if (!user_id || !points || points <= 0) 
      return res.status(400).json({ success: false, message: "Thiếu thông tin" });

    const finalPhone = normalizePhone(phone || user_id);
    const phoneIpos = "84" + finalPhone.replace(/^0/, "");

    // 1. Kiểm tra đủ điểm
    const supabase = require("../supabase");
    const { data: player } = await supabase.from("players")
      .select("total_points").eq("user_id", finalPhone).maybeSingle();
    
    const currentPoints = Number(player?.total_points || 0);
    if (currentPoints < points)
      return res.status(400).json({ success: false, message: `Không đủ điểm. Bạn có ${currentPoints} điểm, cần ${points} điểm.` });

    // 2. Gọi iPOS exchange_point API
    const accessToken = process.env.IPOS_ACCESS_TOKEN || process.env.FOODBOOK_ACCESS_TOKEN;
    const posParent = process.env.IPOS_POS_PARENT || "BRAND-DQIR";
    const url = `https://api.foodbook.vn/ipos/ws/xpartner/exchange_point?access_token=${accessToken}&pos_parent=${posParent}&point=${points}&user_id=${phoneIpos}`;
    
    const https = require("https");
    const iposData = await new Promise((resolve, reject) => {
      https.get(url, res => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      }).on("error", reject);
    });

    if (!iposData?.data?.voucher_code)
      return res.status(400).json({ success: false, message: "Không thể tạo voucher. " + (iposData?.message || JSON.stringify(iposData)) });

    const voucher = iposData.data;

    // 3. Trừ điểm trong app (iPOS đã trừ điểm của họ, sync lại app)
    const { deductPoints } = require("../services/loyaltyPointService");
    await deductPoints({
      phone: finalPhone, user_id: finalPhone,
      points, reason: `Đổi ${points} điểm lấy voucher ${voucher.voucher_code}`,
    });

    // 4. Log analytics
    const { logAnalytics } = require("../services/loyaltyPointService");
    await logAnalytics(finalPhone, "voucher_exchanged", {
      voucher_code: voucher.voucher_code,
      points_used: points,
      discount_amount: voucher.discount_amount,
      date_end: voucher.date_end,
    });

    res.json({
      success: true,
      voucher_code: voucher.voucher_code,
      discount_amount: voucher.discount_amount,
      date_end: voucher.date_end,
      description: voucher.voucher_description,
      message: `Đổi thành công! Mã voucher: ${voucher.voucher_code} (giảm ${new Intl.NumberFormat("vi-VN").format(voucher.discount_amount)}đ)`,
    });

  } catch(err) {
    console.error("[EXCHANGE VOUCHER]", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
