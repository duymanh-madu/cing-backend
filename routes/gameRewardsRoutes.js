const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const redis = require("../services/infrastructure/cache/redisClient");
const { realtimeEventBus } = require("../services/realtime/realtimeEventBus");
const {
  addPoints,
  logAnalytics,
} = require("../services/loyaltyPointService");

async function invalidateMembershipCache(userId) {
  const digits = String(userId || "").replace(/\D/g, "");
  if (!digits) return;

  const phone84 = digits.startsWith("84")
    ? digits
    : "84" + digits.slice(1);

  const phone0 = digits.startsWith("84")
    ? "0" + digits.slice(2)
    : digits;

  await Promise.allSettled([
    redis.del(`membership:${phone84}`),
    redis.del(`membership:${phone0}`),
    redis.del(`membership:${digits}`),
    redis.del(`membership:${userId}`),
  ]);
}

function publishPointsRealtime({ userId, totalPoints }) {
  realtimeEventBus.publish({
    event: "user.updated",
    delivery_type: "BROADCAST",
    payload: {
      user_id: userId,
      phone: userId,
      points_changed: true,
    },
    channel: "user",
    timestamp: new Date().toISOString(),
  });

  realtimeEventBus.publish({
    event: "membership.points",
    delivery_type: "BROADCAST",
    payload: {
      user_id: userId,
      phone: userId,
      points: Number(totalPoints || 0),
      points_changed: true,
    },
    channel: "membership",
    timestamp: new Date().toISOString(),
  });
}

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

    /**
     * Đọc reward trước để phân luồng:
     *
     * - Campaign Quốc khánh:
     *   claim atomic trong PostgreSQL; local points cập nhật ngay;
     *   sau commit mới release durable iPOS campaign sync.
     *
     * - Reward legacy/BXH:
     *   giữ nguyên contract production hiện hữu qua addPoints(),
     *   bao gồm iPOS sync hiện tại.
     *
     * Không thay đổi semantics của reward production ngoài campaign.
     */
    const {
      data: reward,
      error: rewardError,
    } = await supabase
      .from("pending_rewards")
      .select("*")
      .eq("id", rewardId)
      .maybeSingle();

    if (rewardError) {
      throw rewardError;
    }

    if (!reward) {
      return res.status(404).json({
        success: false,
        message: "Reward not found",
      });
    }

    /**
     * =====================================================
     * NATIONAL DAY CAMPAIGN REWARD
     * =====================================================
     */
    if (reward.campaign_claim_id) {
      const { data, error } = await supabase.rpc(
        "claim_pending_reward_atomic",
        {
          p_reward_id: rewardId,
        }
      );

      if (error) {
        if (
          String(error.message || "").includes(
            "pending_reward_not_found"
          )
        ) {
          return res.status(404).json({
            success: false,
            message: "Reward not found",
          });
        }

        throw error;
      }

      const result =
        Array.isArray(data)
          ? data[0]
          : data;

      if (!result?.success) {
        throw new Error(
          "reward_claim_failed"
        );
      }

      const userId =
        result.user_id;

      const points =
        Number(
          result.points || 0
        );

      const totalPoints =
        Number(
          result.new_total_points || 0
        );

      if (!result.already_claimed) {
        await logAnalytics(
          "points_added",
          userId,
          {
            amount: points,
            reason:
              reward.reason ||
              "Nhận quà Quốc khánh 2/9",
            new_total: totalPoints,
            source:
              "campaign_pending_reward",
            pending_reward_id:
              rewardId,
            campaign_claim_id:
              result.campaign_claim_id,
          }
        ).catch(() => {});
      }

      await invalidateMembershipCache(
        userId
      );

      publishPointsRealtime({
        userId,
        totalPoints,
      });

      return res.json({
        success: true,
        already_claimed:
          !!result.already_claimed,
        points,
        total_points:
          totalPoints,
      });
    }

    /**
     * =====================================================
     * LEGACY / LEADERBOARD REWARD
     *
     * Giữ nguyên behavior production trước campaign patch:
     * addPoints() cộng local points + point ledger + iPOS sync
     * + cache invalidation + realtime.
     * =====================================================
     */
    if (reward.claimed) {
      return res.json({
        success: true,
        already_claimed: true,
      });
    }

    const points =
      Number(
        reward.points || 0
      );

    if (points <= 0) {
      throw new Error(
        "invalid_pending_reward_points"
      );
    }

    const pointResult =
      await addPoints({
        user_id:
          reward.user_id,
        phone:
          reward.user_id,
        points,
        reason:
          reward.reason ||
          "Nhận thưởng bảng xếp hạng",
      });

    const claimedAt =
      new Date().toISOString();

    const {
      error: claimError,
    } = await supabase
      .from("pending_rewards")
      .update({
        claimed: true,
        claimed_at: claimedAt,
      })
      .eq("id", rewardId)
      .eq("claimed", false);

    if (claimError) {
      throw claimError;
    }

    return res.json({
      success: true,
      already_claimed: false,
      points,
      total_points:
        Number(
          pointResult?.total || 0
        ),
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e.message,
    });
  }
});

module.exports = router;