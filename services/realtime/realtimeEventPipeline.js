const {

  sendToMember,

  sendToAdmins,

  sendToCampaign,

  sendToStore,

  broadcastVoucher,

  broadcastLeaderboard,

} = require(
  "./realtimeEmitterService"
);

const logger =
  require(
    "../loggerService"
  );

/**
 * =====================================================
 * MEMBER EVENT
 * =====================================================
 */

function emitMemberEvent({

  memberId,

  event,

  payload = {},

}) {

  sendToMember({

    memberId,

    event,

    payload,

  });

}

/**
 * =====================================================
 * ADMIN EVENT
 * =====================================================
 */

function emitAdminEvent({

  event,

  payload = {},

}) {

  sendToAdmins({

    event,

    payload,

  });

}

/**
 * =====================================================
 * STORE EVENT
 * =====================================================
 */

function emitStoreEvent({

  storeId,

  event,

  payload = {},

}) {

  sendToStore({

    storeId,

    event,

    payload,

  });

}

/**
 * =====================================================
 * CAMPAIGN EVENT
 * =====================================================
 */

function emitCampaignEvent({

  campaignId,

  event,

  payload = {},

}) {

  sendToCampaign({

    campaignId,

    event,

    payload,

  });

}

/**
 * =====================================================
 * VOUCHER EVENT
 * =====================================================
 */

function emitVoucherEvent({

  event,

  payload = {},

}) {

  broadcastVoucher({

    event,

    payload,

  });

}

/**
 * =====================================================
 * LEADERBOARD EVENT
 * =====================================================
 */

function emitLeaderboardEvent({

  event,

  payload = {},

}) {

  broadcastLeaderboard({

    event,

    payload,

  });

}

/**
 * =====================================================
 * CENTRALIZED PIPELINE
 * =====================================================
 */

function processRealtimeEvent({

  type,

  target,

  event,

  payload = {},

}) {

  try {

    switch (type) {

      case "member":

        emitMemberEvent({

          memberId:
            target,

          event,

          payload,

        });

        break;

      case "admin":

        emitAdminEvent({

          event,

          payload,

        });

        break;

      case "store":

        emitStoreEvent({

          storeId:
            target,

          event,

          payload,

        });

        break;

      case "campaign":

        emitCampaignEvent({

          campaignId:
            target,

          event,

          payload,

        });

        break;

      case "voucher":

        emitVoucherEvent({

          event,

          payload,

        });

        break;

      case "leaderboard":

        emitLeaderboardEvent({

          event,

          payload,

        });

        break;

      default:

        logger.warn(

          "Unknown realtime event type",

          {

            type,

          }

        );

    }

  } catch (error) {

    logger.error(

      "Realtime pipeline failed",

      {

        error:
          error.message,

        type,

        event,

      }

    );

  }

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  processRealtimeEvent,

  emitMemberEvent,

  emitAdminEvent,

  emitStoreEvent,

  emitCampaignEvent,

  emitVoucherEvent,

  emitLeaderboardEvent,

};