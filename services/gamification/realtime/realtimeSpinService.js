const {

  realtimeEventBus,

} = require(
  "../../realtime/realtimeEventBus"
);

async function emitSpinReward({

  userId,

  reward,

}) {

  realtimeEventBus.publish({

    event:
      "spin.reward",

    room:
      `room:user:${userId}`,

    payload: {

      reward,

    },

  });

}

module.exports = {

  emitSpinReward,

};