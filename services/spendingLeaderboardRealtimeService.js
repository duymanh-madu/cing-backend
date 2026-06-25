const { realtimeEventBus } = require("./realtime/realtimeEventBus");
const { getTopSpenders } = require("./leaderboardService");

const SPENDING_PERIODS = ["weekly", "monthly", "yearly", "alltime", "custom"];

function resolveUserId(updatedUser) {
  if (!updatedUser) return "";
  if (typeof updatedUser === "string" || typeof updatedUser === "number") return String(updatedUser);
  return String(updatedUser.user_id || updatedUser.phone || updatedUser.phone_number || "");
}

async function emitSpendingLeaderboardUpdates({
  periods = SPENDING_PERIODS,
  updatedUser = null,
  amountAdded = null,
  reason = "spending_changed",
} = {}) {
  const safePeriods = [...new Set(periods)].filter(p => SPENDING_PERIODS.includes(p));
  if (safePeriods.length === 0) return [];

  const updatedUserId = resolveUserId(updatedUser);
  const emitted = [];

  for (const period of safePeriods) {
    try {
      const leaderboard = await getTopSpenders({ period, limit: 100 });

      realtimeEventBus.publish({
        event: "leaderboard.updated",
        delivery_type: "BROADCAST",
        channel: "leaderboard",
        timestamp: new Date().toISOString(),
        payload: {
          type: "spending",
          period,
          reason,
          updated_user: {
            user_id: updatedUserId,
            ...(updatedUser && typeof updatedUser === "object" ? updatedUser : {}),
          },
          amount_added: amountAdded,
          leaderboard,
          timestamp: new Date().toISOString(),
        },
      });

      emitted.push(period);
    } catch (e) {
      console.warn(`[SPENDING LB] Emit failed for ${period}:`, e.message);
    }
  }

  if (emitted.length > 0) {
    console.log(`[SPENDING LB] Broadcasted realtime periods: ${emitted.join(", ")}`);
  }

  return emitted;
}

module.exports = {
  emitSpendingLeaderboardUpdates,
};
