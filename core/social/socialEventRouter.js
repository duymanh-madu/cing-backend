const {

  processDailyCheckin,

} = require(
  "../../services/social/dailyCheckinService"
);

const {

  registerReferral,

} = require(
  "../../services/social/referralEngineService"
);

const {

  processSocialReward,

} = require(
  "../../services/social/socialRewardOrchestratorService"
);

/**
 * =====================================================
 * SOCIAL EVENT ROUTER
 * =====================================================
 */

function routeSocialEvent({

  type,

  payload,

}) {

  switch (
    type
  ) {

    case "daily_checkin":

      processDailyCheckin({

        user_id:
          payload.user_id,

      });

      processSocialReward({

        user_id:
          payload.user_id,

        type:
          "daily_checkin",

      });

      break;

    case "referral_success":

      registerReferral({

        inviter_user_id:
          payload.inviter_user_id,

        invited_user_id:
          payload.invited_user_id,

        referral_code:
          payload.referral_code,

      });

      processSocialReward({

        user_id:
          payload.inviter_user_id,

        type:
          "referral_success",

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

  routeSocialEvent,

};