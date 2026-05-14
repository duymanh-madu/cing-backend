const {

  REALTIME_CHANNELS,

  buildMemberRoom,

  buildDeliveryRoom,

  buildStoreRoom,

  buildCampaignRoom,

} = require(
  "./realtimeChannels"
);

const logger =
  require(
    "../loggerService"
  );

/**
 * =====================================================
 * GET IO
 * =====================================================
 */

function getIO() {

  if (!global.io) {

    throw new Error(
      "Socket.IO not initialized"
    );

  }

  return global.io;

}

/**
 * =====================================================
 * EMIT TO ROOM
 * =====================================================
 */

function emitToRoom({

  room,

  event,

  payload = {},

}) {

  const io =
    getIO();

  io.to(room).emit(

    event,

    payload

  );

  logger.info(

    "Realtime event emitted",

    {

      room,

      event,

    }

  );

}

/**
 * =====================================================
 * SEND TO MEMBER
 * =====================================================
 */

function sendToMember({

  memberId,

  event,

  payload = {},

}) {

  const room =
    buildMemberRoom(
      memberId
    );

  emitToRoom({

    room,

    event,

    payload,

  });

}

/**
 * =====================================================
 * SEND TO DELIVERY
 * =====================================================
 */

function sendToDelivery({

  driverId,

  event,

  payload = {},

}) {

  const room =
    buildDeliveryRoom(
      driverId
    );

  emitToRoom({

    room,

    event,

    payload,

  });

}

/**
 * =====================================================
 * SEND TO STORE
 * =====================================================
 */

function sendToStore({

  storeId,

  event,

  payload = {},

}) {

  const room =
    buildStoreRoom(
      storeId
    );

  emitToRoom({

    room,

    event,

    payload,

  });

}

/**
 * =====================================================
 * SEND TO CAMPAIGN
 * =====================================================
 */

function sendToCampaign({

  campaignId,

  event,

  payload = {},

}) {

  const room =
    buildCampaignRoom(
      campaignId
    );

  emitToRoom({

    room,

    event,

    payload,

  });

}

/**
 * =====================================================
 * SEND TO ADMINS
 * =====================================================
 */

function sendToAdmins({

  event,

  payload = {},

}) {

  emitToRoom({

    room:
      REALTIME_CHANNELS.ADMIN,

    event,

    payload,

  });

}

/**
 * =====================================================
 * BROADCAST LEADERBOARD
 * =====================================================
 */

function broadcastLeaderboard({

  event,

  payload = {},

}) {

  emitToRoom({

    room:
      REALTIME_CHANNELS.LEADERBOARD,

    event,

    payload,

  });

}

/**
 * =====================================================
 * BROADCAST VOUCHER
 * =====================================================
 */

function broadcastVoucher({

  event,

  payload = {},

}) {

  emitToRoom({

    room:
      REALTIME_CHANNELS.VOUCHER,

    event,

    payload,

  });

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  emitToRoom,

  sendToMember,

  sendToDelivery,

  sendToStore,

  sendToCampaign,

  sendToAdmins,

  broadcastLeaderboard,

  broadcastVoucher,

};