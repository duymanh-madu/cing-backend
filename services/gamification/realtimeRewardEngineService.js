const {

  calculateMemberTier,

} = require(
  "../loyalty/loyaltyTierService"
);

const {

  getPointBalance,

} = require(
  "../loyalty/loyaltyPointService"
);

/**
 * =====================================================
 * PROCESS REWARD ENGINE
 * =====================================================
 */

function processRealtimeReward({

  user_id,

}) {

  const balance =
    getPointBalance(
      user_id
    );

  const tier =
    calculateMemberTier(
      balance
    );

  return {

    user_id,

    points:
      balance,

    current_tier:
      tier.tier,

    processed_at:
      Date.now(),

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  processRealtimeReward,

};