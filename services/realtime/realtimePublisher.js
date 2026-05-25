const redisPublisher =
  require(
    "../infrastructure/cache/redisPublisher"
  );

const {
  REDIS_CHANNELS,
} = require(
  "./realtimeEventConstants"
);

const {
  validateRealtimeEvent,
} = require(
  "./realtimeEventValidator"
);

async function publishRealtimeEvent({

  event,

  payload,

  room = null,

  socketId = null,

}) {

  validateRealtimeEvent({

    event,

    payload,

    room,

    socketId,

  });

  const realtimeEvent = {

    event,

    payload,

    room,

    socketId,

    timestamp:
      new Date().toISOString(),

  };

  await redisPublisher.publish(

    REDIS_CHANNELS
      .REALTIME_EVENTS,

    JSON.stringify(
      realtimeEvent
    )

  );

  return realtimeEvent;

}

module.exports = {

  publishRealtimeEvent,

};