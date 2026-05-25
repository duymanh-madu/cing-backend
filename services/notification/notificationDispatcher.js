const {

  broadcastToRoom,

} = require(
  "../realtime/realtimeBroadcastService"
);

async function dispatchNotification({

  io,

  room,

  event,

  payload,

}) {

  await broadcastToRoom({

    io,

    room,

    event,

    payload,

  });

}

module.exports = {

  dispatchNotification,

};