const { addPoints } = require("../loyaltyPointService");

/**
 * GIVE REWARD
 * Cong diem thuat - sync ve iPos
 */
async function giveReward({ user_id, phone, points, reason }) {
  const result = await addPoints({
    phone: phone || user_id,
    user_id,
    points,
    reason: reason || "Phần thưởng game",
  });
  return {
    success: true,
    reason,
    balance: result.total,
  };
}

module.exports = { giveReward };
