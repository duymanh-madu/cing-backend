const {

  realtimeEventBus,

} = require(
  "./realtimeEventBus"
);

const {

  createRealtimeEvent,

} = require(
  "./realtimeEventContracts"
);

/**
 * =====================================================
 * PUBLISH REALTIME EVENT
 * =====================================================
 */

function publishRealtimeEvent({

  event,

  channel,

  payload = {},

  deliveryType,

  room = null,

  socketId = null,

  priority,

}) {

  const realtimeEvent =
    createRealtimeEvent({

      event,

      channel,

      payload,

      deliveryType,

      room,

      socketId,

      priority,

    });

  realtimeEventBus.publish(
    realtimeEvent
  );

  return realtimeEvent;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  publishRealtimeEvent,

};