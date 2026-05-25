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

async function emitXPUpdate({

  userId,

  xp,

  earnedXP,

}) {

  realtimeEventBus.publish({

    event:
      REALTIME_EVENTS
        .GAME_SCORE_UPDATED,

    room:
      `room:user:${userId}`,

    payload: {

      xp,

      earnedXP,

    },

  });

}

module.exports = {

  emitXPUpdate,

};