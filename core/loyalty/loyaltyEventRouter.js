const {

  giveReward,

} = require(
  "../../services/gamification/gamificationRewardService"
);

/**
 * =====================================================
 * LOYALTY EVENT ROUTER
 * =====================================================
 */

function routeLoyaltyEvent({

  type,

  payload,

}) {

  switch (
    type
  ) {

    case "payment_success":

      giveReward({

        user_id:
          payload.user_id,

        points: 100,

        reason:
          "Thanh toán thành công",

      });

      break;

    case "game_win":

      giveReward({

        user_id:
          payload.user_id,

        points: 50,

        reason:
          "Chiến thắng trò chơi",

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

  routeLoyaltyEvent,

};