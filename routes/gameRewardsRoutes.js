const express = require("express");
const router = express.Router();
const supabase = require("../supabase");

// GET pending rewards
router.get("/pending/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from("pending_rewards")
      .select("*")
      .eq("user_id", userId)
      .eq("claimed", false)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data || []
    });

  } catch (e) {
    res.status(500).json({
      success: false,
      error: e.message
    });
  }
});

// CLAIM reward
router.post("/claim/:rewardId", async (req, res) => {
  try {
    const { rewardId } = req.params;

    const { data: reward, error } = await supabase
      .from("pending_rewards")
      .select("*")
      .eq("id", rewardId)
      .single();

    if (error || !reward) {
      return res.status(404).json({
        success: false,
        message: "Reward not found"
      });
    }

    if (reward.claimed) {
      return res.json({
        success: true,
        already_claimed: true
      });
    }

    const { data: player } = await supabase
      .from("players")
      .select("total_points")
      .eq("user_id", reward.user_id)
      .single();

    await supabase
      .from("players")
      .update({
        total_points:
          Number(player?.total_points || 0) +
          Number(reward.points || 0)
      })
      .eq("user_id", reward.user_id);

    await supabase
      .from("pending_rewards")
      .update({
        claimed: true,
        claimed_at: new Date().toISOString()
      })
      .eq("id", rewardId);

    res.json({
      success: true,
      points: reward.points
    });

  } catch (e) {
    res.status(500).json({
      success: false,
      error: e.message
    });
  }
});

module.exports = router;