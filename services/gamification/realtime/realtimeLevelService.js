const {

  REALTIME_EVENTS,

} = require(
  "../../realtime/realtimeEventConstants"
);

const {

  realtimeEventBus,

} = require(
  "../../realtime/realtimeEventBus"
);

async function emitLevelUp({

  userId,

  level,

}) {

  realtimeEventBus.publish({

    event:
      REALTIME_EVENTS
        .USER_UPDATED,

    room:
      `room:user:${userId}`,

    payload: {

      level,

      levelUp:
        true,

    },

  });

}

module.exports = {

  emitLevelUp,

};