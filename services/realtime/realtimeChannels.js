/**
 * =====================================================
 * REALTIME CHANNELS
 * =====================================================
 */

const REALTIME_CHANNELS = {

  MEMBER: "member",

  ADMIN: "admin",

  DELIVERY: "delivery",

  STORE: "store",

  CAMPAIGN: "campaign",

  LEADERBOARD: "leaderboard",

  NOTIFICATION: "notification",

  VOUCHER: "voucher",

};

/**
 * =====================================================
 * ROOM BUILDERS
 * =====================================================
 */

function buildMemberRoom(
  memberId
) {

  return `${REALTIME_CHANNELS.MEMBER}:${memberId}`;

}

function buildDeliveryRoom(
  driverId
) {

  return `${REALTIME_CHANNELS.DELIVERY}:${driverId}`;

}

function buildStoreRoom(
  storeId
) {

  return `${REALTIME_CHANNELS.STORE}:${storeId}`;

}

function buildCampaignRoom(
  campaignId
) {

  return `${REALTIME_CHANNELS.CAMPAIGN}:${campaignId}`;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  REALTIME_CHANNELS,

  buildMemberRoom,

  buildDeliveryRoom,

  buildStoreRoom,

  buildCampaignRoom,

};