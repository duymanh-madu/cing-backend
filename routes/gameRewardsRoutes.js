const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const redis = require("../services/infrastructure/cache/redisClient");
const { realtimeEventBus } = require("../services/realtime/realtimeEventBus");
const {
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
     * Read reward for response / analytics metadata.
     *
     * Every pending reward is consumed through the same
     * PostgreSQL exactly-once local mutation authority.
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
     * All pending rewards — campaign and leaderboard — are consumed
     * through the same PostgreSQL atomic authority.
     *
     * claim_pending_reward_atomic() owns:
     * - pending_rewards row lock
     * - claimed fence
     * - players row lock
     * - local point balance mutation
     * - point_transactions ledger
     * - claimed/claimed_at mutation
     *
     * Only the request that actually consumes the reward receives
     * already_claimed=false.
     */
    {
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
              reward.campaign_claim_id
                ? "campaign_pending_reward"
                : "leaderboard_pending_reward",
            pending_reward_id:
              rewardId,
            campaign_claim_id:
              result.campaign_claim_id,
          }
        ).catch(() => {});
      }

      /**
       * iPOS delivery is intentionally outside the HTTP claim path.
       *
       * - campaign reward:
       *   claim_pending_reward_atomic() releases the existing
       *   campaign durable delivery.
       *
       * - ordinary / leaderboard reward:
       *   the same RPC persists pending_rewards.ipos_sync_status
       *   = 'pending' in the local claim transaction.
       *
       * A durable worker performs preflight/postflight verification
       * using the immutable pending_reward UUID as its iPOS note.
       */

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

  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e.message,
    });
  }
});

module.exports = router;