const express = require("express");
const router = express.Router();
const supabase = require("../supabase");

const POINTS_PER_PLAY = 5; // 5 diem = 1 luot choi

// GET /api/points/:user_id - lay diem hien tai
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

// POST /api/points/buy-plays - dung diem mua luot choi
router.post("/buy-plays", async (req, res) => {
  try {
    const { user_id, quantity = 1 } = req.body;
    if (!user_id) return res.status(400).json({ success: false, message: "Thiếu user_id" });

    const cost = quantity * POINTS_PER_PLAY;

    // Lay diem hien tai
    const { data: player } = await supabase
      .from("players")
      .select("game_plays, total_points")
      .eq("user_id", user_id)
      .maybeSingle();

    const currentPoints = Number(player?.total_points || 0);
    const currentPlays = Number(player?.game_plays || 0);

    if (currentPoints < cost) {
      return res.status(400).json({
        success: false,
        message: `Không đủ điểm. Cần ${cost} điểm, bạn có ${currentPoints} điểm.`
      });
    }

    // Tru diem va cong luot choi
    await supabase.from("players").upsert({
      user_id,
      total_points: currentPoints - cost,
      game_plays: currentPlays + quantity,
    }, { onConflict: "user_id" });

    res.json({
      success: true,
      message: `Mua thành công ${quantity} lượt chơi! (-${cost} điểm)`,
      data: {
        plays_added: quantity,
        points_spent: cost,
        remaining_points: currentPoints - cost,
        new_plays: currentPlays + quantity,
      }
    });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
