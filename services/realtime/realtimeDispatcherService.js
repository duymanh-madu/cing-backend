const {

  DELIVERY_TYPES,

} = require(
  "./realtimeEventContracts"
);

const {

  trackRealtimeDelivered,

  trackRealtimeFailed,

} = require(
  "./realtimeMetricsService"
);

const logger =
  require(
    "../loggerService"
  );

/**
 * =====================================================
 * DISPATCH REALTIME EVENT
 * =====================================================
 */

function dispatchRealtimeEvent({

  io,

  realtimeEvent,

}) {

  try {

    /**
     * ============================================
     * BROADCAST
     * ============================================
     */

    if (

      realtimeEvent.delivery_type ===
      DELIVERY_TYPES.BROADCAST

    ) {

      io.emit(

        realtimeEvent.event,

        realtimeEvent.payload

      );

    }

    /**
     * ============================================
     * ROOM
     * ============================================
     */

    else if (

      realtimeEvent.delivery_type ===
      DELIVERY_TYPES.ROOM

    ) {

      io.to(
        realtimeEvent.room
      ).emit(

        realtimeEvent.event,

        realtimeEvent.payload

      );

    }

    /**
     * ============================================
     * SOCKET
     * ============================================
     */

    else if (

      realtimeEvent.delivery_type ===
      DELIVERY_TYPES.SOCKET

    ) {

      io.to(
        realtimeEvent.socket_id
      ).emit(

        realtimeEvent.event,

        realtimeEvent.payload

      );

    }

    trackRealtimeDelivered({

      channel:
        realtimeEvent.channel,

    });

    logger.info(

      "Realtime event delivered",

      {

        event:
          realtimeEvent.event,

        channel:
          realtimeEvent.channel,

      }

    );

  } catch (error) {

    trackRealtimeFailed({

      channel:
        realtimeEvent.channel,

    });

    logger.error(

      "Realtime dispatch failed",

      {

        event:
          realtimeEvent.event,

        error:
          error.message,

      }

    );

  }

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  dispatchRealtimeEvent,

};