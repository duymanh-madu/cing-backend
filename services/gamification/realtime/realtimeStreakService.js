const {

  realtimeEventBus,

} = require(
  "../../realtime/realtimeEventBus"
);

async function emitStreakUpdate({

  userId,

  streak,

}) {

  realtimeEventBus.publish({

    event:
      "streak.updated",

    room:
      `room:user:${userId}`,

    payload: {

      streak,

    },

  });

}

module.exports = {

  emitStreakUpdate,

};