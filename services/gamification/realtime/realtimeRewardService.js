const {

  realtimeEventBus,

} = require(
  "../../realtime/realtimeEventBus"
);

async function emitRewardGranted({

  userId,

  reward,

}) {

  realtimeEventBus.publish({

    event:
      "reward.granted",

    room:
      `room:user:${userId}`,

    payload: {

      reward,

    },

  });

}

module.exports = {

  emitRewardGranted,

};