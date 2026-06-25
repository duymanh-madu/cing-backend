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
  game_key = null,
  scope = "weekly",
  reason = "leaderboard_updated",
  updated_user = null,
  previous_best = null,
  score = null,
  highscore_changed = false,

}) {

  realtimeEventBus.publish({

    event:
      REALTIME_EVENTS
        .LEADERBOARD_UPDATED,

    delivery_type:
      "BROADCAST",

    room:
      "room:leaderboard:global",

    channel:
      "leaderboard",

    timestamp:
      new Date().toISOString(),

    payload: {

      type:
        "game",

      game_key,

      scope,

      reason,

      updated_user,

      previous_best,

      score,

      highscore_changed,

      leaderboard,

      timestamp:
        new Date().toISOString(),

    },

  });

}

module.exports = {

  emitLeaderboardUpdate,

};