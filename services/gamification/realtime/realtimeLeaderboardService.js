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

async function emitLeaderboardUpdate({

  leaderboard,

}) {

  realtimeEventBus.publish({

    event:
      REALTIME_EVENTS
        .LEADERBOARD_UPDATED,

    room:
      "room:leaderboard:global",

    payload: {

      leaderboard,

    },

  });

}

module.exports = {

  emitLeaderboardUpdate,

};