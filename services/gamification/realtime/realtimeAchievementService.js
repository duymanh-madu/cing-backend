const {

  realtimeEventBus,

} = require(
  "../../realtime/realtimeEventBus"
);

async function emitAchievementUnlocked({

  userId,

  achievement,

}) {

  realtimeEventBus.publish({

    event:
      "achievement.unlocked",

    room:
      `room:user:${userId}`,

    payload: {

      achievement,

    },

  });

}

module.exports = {

  emitAchievementUnlocked,

};