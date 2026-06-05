const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { deductPoints } = require("../services/loyaltyPointService");

const POINTS_PER_PLAY = 5;

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
router.post("/buy-plays", async (req, res) => {
  try {
    const { user_id, phone, quantity = 1 } = req.body;
    if (!user_id) return res.status(400).json({ success: false, message: "Thiếu user_id" });

    const cost = quantity * POINTS_PER_PLAY;

    // Tru diem qua loyaltyPointService - tu dong sync ve iPOS
    const result = await deductPoints({
      phone: phone || user_id,
      user_id,
      points: cost,
      reason: `Mua ${quantity} lượt chơi game`,
    });

    // Cong luot choi
    const { data: player } = await supabase.from("players").select("game_plays").eq("user_id", user_id).maybeSingle();
    const newPlays = Number(player?.game_plays || 0) + quantity;
    await supabase.from("players").update({ game_plays: newPlays }).eq("user_id", user_id);
    const { addPlays } = require("../services/loyaltyPointService");
    await addPlays({ user_id, amount: quantity, reason: "Đổi điểm lấy lượt chơi", new_total: newPlays }).catch(()=>{});

    res.json({
      success: true,
      message: `Mua thành công ${quantity} lượt chơi! (-${cost} điểm)`,
      data: {
        plays_added: quantity,
        points_spent: cost,
        remaining_points: result.remaining,
        new_plays: newPlays,
      }
    });
  } catch(err) {
    res.status(400).json({ success: false, message: err.message });
  }
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
router.post("/pay-with-points", async (req, res) => {
  try {
    const { user_id, phone, points, order_id, order_data } = req.body;
    if (!user_id || !points) return res.status(400).json({ success: false, message: "Thiếu thông tin" });

    const finalPhone = (phone || user_id).replace(/\D/g,"").replace(/^84/,"0");

    // 1. Deduct points
    const result = await deductPoints({
      phone: finalPhone, user_id: finalPhone,
      points, reason: "Thanh toán đơn hàng bằng điểm",
    });

    // 2. Update order payment_method = "points" TRƯỚC khi push iPOS
    if (order_id) {
      try {
        const supabase = require("../supabase");
        await supabase.from("orders").update({
          payment_status: "paid",
          status_code: "confirmed",
          order_created: true,
          payment_method: "points",
        }).eq("id", order_id);
      } catch(e) {}
    }

    // 3. Push order to iPOS — fetch order từ DB sau khi đã update payment_method
    if (order_id) {
      try {
        const supabase = require("../supabase");
        const { pushOrderToIPOS } = require("../services/iposOrderService");
        const { data: order } = await supabase
          .from("orders").select("*").eq("id", order_id).single();
        if (order) {
          // Override payment_method để buildPayload dùng đúng
          order.payment_method = "points";
          const iposResult = await pushOrderToIPOS({ order, transaction_code: order.order_code });
          console.log("[POINTS PAY] iPOS push:", iposResult.success ? "OK" : iposResult.error);
        }
      } catch(e) {
        console.warn("[POINTS PAY] iPOS push failed:", e.message);
      }
    }

    res.json({ success: true, ...result });
  } catch(err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/points/exchange-voucher — đổi điểm lấy voucher iPOS
router.post("/exchange-voucher", async (req, res) => {
  try {
    const { user_id, phone, points } = req.body;
    if (!user_id || !points || points <= 0) 
      return res.status(400).json({ success: false, message: "Thiếu thông tin" });

    const finalPhone = (phone || user_id).replace(/\D/g,"").replace(/^84/,"0");
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
