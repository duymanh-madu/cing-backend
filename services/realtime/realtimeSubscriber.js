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

        realtimeEventBus.emit(
          parsed.event,
          parsed
        );

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