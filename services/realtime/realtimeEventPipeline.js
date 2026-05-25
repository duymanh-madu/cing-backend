const { realtimeEventBus } = require('./realtimeEventBus');
function sendToMember(p) { realtimeEventBus.publish({event: p.event||'user.updated', delivery_type:'BROADCAST', payload:p.payload, channel:'user', timestamp:new Date().toISOString()}); }
function sendToAdmins(p) { realtimeEventBus.publish({event: p.event||'admin.updated', delivery_type:'BROADCAST', payload:p.payload, channel:'admin', timestamp:new Date().toISOString()}); }
function sendToCampaign(p) { realtimeEventBus.publish({event: p.event||'campaign.updated', delivery_type:'BROADCAST', payload:p.payload, channel:'campaign', timestamp:new Date().toISOString()}); }
function sendToStore(p) { realtimeEventBus.publish({event: p.event||'store.updated', delivery_type:'BROADCAST', payload:p.payload, channel:'store', timestamp:new Date().toISOString()}); }
function broadcastVoucher(p) { realtimeEventBus.publish({event:'voucher.updated', delivery_type:'BROADCAST', payload:p.payload, channel:'voucher', timestamp:new Date().toISOString()}); }
function broadcastLeaderboard(p) { realtimeEventBus.publish({event:'leaderboard.updated', delivery_type:'BROADCAST', payload:p.payload, channel:'leaderboard', timestamp:new Date().toISOString()}); }

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