const express = require("express");
const {
  processNationalDayRewardIposClaim,
} = require(
  "../services/campaign/nationalDayRewardIposSyncWorker"
);

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
       * Durable iPOS delivery remains transactionally decoupled from
       * the customer HTTP claim.
       *
       * Campaign reward:
       * - claim_pending_reward_atomic() commits the local points claim
       * - the same transaction releases campaign_reward_claims to pending
       * - only the first successful claim receives already_claimed=false
       * - after commit, kick that exact campaign claim immediately
       * - any fast-path failure remains recoverable by the durable worker
       *
       * Ordinary / leaderboard reward:
       * - pending_rewards itself remains the durable iPOS outbox
       * - its existing worker remains the delivery authority
       *
       * The fast path never performs an iPOS mutation directly here.
       */
      if (
        !result.already_claimed &&
        result.campaign_claim_id
      ) {
        const campaignClaimId =
          result.campaign_claim_id;

        setImmediate(() => {
          processNationalDayRewardIposClaim(
            campaignClaimId
          ).catch(error => {
            console.error(
              "[NATIONAL DAY REWARD] immediate iPOS sync failed",
              {
                campaignClaimId,
                error:
                  error?.message ||
                  "unknown_error",
              }
            );
          });
        });
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

  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e.message,
    });
  }
});

module.exports = router;