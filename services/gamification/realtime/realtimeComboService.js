const {

  realtimeEventBus,

} = require(
  "../../realtime/realtimeEventBus"
);

async function emitComboUpdate({

  userId,

  combo,

  multiplier,

}) {

  realtimeEventBus.publish({

    event:
      "combo.updated",

    room:
      `room:user:${userId}`,

    payload: {

      combo,

      multiplier,

    },

  });

}

module.exports = {

  emitComboUpdate,

};