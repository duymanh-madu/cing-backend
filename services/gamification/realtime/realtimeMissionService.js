const {

  realtimeEventBus,

} = require(
  "../../realtime/realtimeEventBus"
);

async function emitMissionCompleted({

  userId,

  mission,

}) {

  realtimeEventBus.publish({

    event:
      "mission.completed",

    room:
      `room:user:${userId}`,

    payload: {

      mission,

    },

  });

}

module.exports = {

  emitMissionCompleted,

};