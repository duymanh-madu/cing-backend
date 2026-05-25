const {

  earnPoints,

} = require(
  "../loyalty/loyaltyPointService"
);

/**
 * =====================================================
 * GIVE REWARD
 * =====================================================
 */

function giveReward({

  user_id,

  points,

  reason,

}) {

  const balance =
    earnPoints({

      user_id,

      points,

    });

  return {

    success: true,

    reason,

    balance,

    rewarded_at:
      Date.now(),

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  giveReward,

};