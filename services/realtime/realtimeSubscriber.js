const redisSubscriber =
  require(
    "../infrastructure/cache/redisSubscriber"
  );

const {
  REDIS_CHANNELS,
} = require(
  "./realtimeEventConstants"
);

const realtimeEventBus =
  require(
    "./realtimeEventBus"
  );

async function initializeRealtimeSubscriber() {

  await redisSubscriber.subscribe(

    REDIS_CHANNELS
      .REALTIME_EVENTS

  );

  redisSubscriber.on(
    "message",

    (
      channel,
      message
    ) => {

      if (
        channel !==
        REDIS_CHANNELS
          .REALTIME_EVENTS
      ) {

        return;

      }

      try {

        const parsed =
          JSON.parse(
            message
          );

        // Forward toi Socket.IO clients qua publish (dispatch)
        if (realtimeEventBus.io) {
          realtimeEventBus.publish(parsed);
        } else {
          realtimeEventBus.emit(parsed.event, parsed);
        }

      } catch (error) {

        console.error(
          "Realtime subscriber error:",
          error.message
        );

      }

    }
  );

  console.log(
    "🚀 Realtime subscriber initialized"
  );

}

module.exports = {

  initializeRealtimeSubscriber,

};