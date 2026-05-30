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

    // 2. Push order to iPOS nếu có order_data
    if (order_data) {
      try {
        const { pushOrderToIPOS } = require("../services/iposOrderService");
        const iposResult = await pushOrderToIPOS({
          ...order_data,
          payment_method: "points",
          payment_status: "paid",
        });
        console.log("[POINTS PAY] iPOS push:", iposResult.success ? "OK" : iposResult.error);
      } catch(e) {
        console.warn("[POINTS PAY] iPOS push failed:", e.message);
      }
    }

    // 3. Update order status nếu có order_id
    if (order_id) {
      try {
        const supabase = require("../supabase");
        await supabase.from("orders").update({
          payment_status: "paid",
          status_code: "confirmed",
          order_created: true,
        }).eq("id", order_id);
      } catch(e) {}
    }

    res.json({ success: true, ...result });
  } catch(err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
