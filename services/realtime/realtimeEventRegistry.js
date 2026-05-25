const realtimeEventBus =
  require(
    "./realtimeEventBus"
  );

const realtimeMetrics =
  require(
    "./realtimeEventMetrics"
  );

function registerRealtimeEvent({

  event,

  handler,

}) {

  realtimeEventBus.on(

    event,

    async (
      data
    ) => {

      try {

        realtimeMetrics
          .incrementReceived();

        await handler(
          data
        );

      } catch (error) {

        realtimeMetrics
          .incrementErrors();

        console.error(
          `Realtime handler error (${event}):`,
          error.message
        );

      }

    }

  );

}

module.exports = {

  registerRealtimeEvent,

};