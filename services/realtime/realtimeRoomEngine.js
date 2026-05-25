const {
  ROOM_PREFIXES,
} = require(
  "./realtimeEventConstants"
);

function buildUserRoom(
  userId
) {

  return `${ROOM_PREFIXES.USER}${userId}`;

}

function buildOrderRoom(
  orderId
) {

  return `${ROOM_PREFIXES.ORDER}${orderId}`;

}

function buildDeliveryRoom(
  deliveryId
) {

  return `${ROOM_PREFIXES.DELIVERY}${deliveryId}`;

}

function buildLeaderboardRoom(
  leaderboardId
) {

  return `${ROOM_PREFIXES.LEADERBOARD}${leaderboardId}`;

}

module.exports = {

  buildUserRoom,

  buildOrderRoom,

  buildDeliveryRoom,

  buildLeaderboardRoom,

};