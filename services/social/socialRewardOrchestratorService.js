const {

  giveReward,

} = require(
  "../gamification/gamificationRewardService"
);

const {

  unlockAchievement,

} = require(
  "./achievementEngineService"
);

/**
 * =====================================================
 * PROCESS SOCIAL REWARD
 * =====================================================
 */

function processSocialReward({

  user_id,

  type,

}) {

  switch (
    type
  ) {

    case "daily_checkin":

      giveReward({

        user_id,

        points: 20,

        reason:
          "Điểm danh hàng ngày",

      });

      break;

    case "referral_success":

      giveReward({

        user_id,

        points: 100,

        reason:
          "Mời bạn thành công",

      });

      unlockAchievement({

        user_id,

        code:
          "FIRST_REFERRAL",

        title:
          "Người kết nối",

      });

      break;

    default:

      break;

  }

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  processSocialReward,

};