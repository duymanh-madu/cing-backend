const EventEmitter =
  require("events");

const {

  dispatchRealtimeEvent,

} = require(
  "./realtimeDispatcherService"
);

const {

  trackRealtimePublished,

} = require(
  "./realtimeMetricsService"
);

const {

  validateRealtimeEvent,

} = require(
  "./realtimeEventValidator"
);

const logger =
  require(
    "../loggerService"
  );

/**
 * =====================================================
 * REALTIME EVENT BUS
 * =====================================================
 */

class RealtimeEventBus extends EventEmitter {

  constructor() {

    super();

    /**
     * ===============================================
     * SOCKET IO INSTANCE
     * ===============================================
     */

    this.io = null;

    /**
     * ===============================================
     * MEMORY PROTECTION
     * ===============================================
     */

    this.setMaxListeners(
      100
    );

  }

  /**
   * ============================================
   * SET IO
   * ============================================
   */

  setIO(io) {

    this.io = io;

    logger.info(
      "Realtime bus IO attached"
    );

  }

  /**
   * ============================================
   * GET IO
   * ============================================
   */

  getIO() {

    return this.io;

  }

  /**
   * ============================================
   * PUBLISH
   * ============================================
   */

  publish(
    realtimeEvent
  ) {

    try {

      /**
       * ==========================================
       * VALIDATE
       * ==========================================
       */

      validateRealtimeEvent({

        event:
          realtimeEvent.event,

        payload:
          realtimeEvent.payload,

        room:
          realtimeEvent.room,

        socketId:
          realtimeEvent.socketId,

      });

      /**
       * ==========================================
       * IO CHECK
       * ==========================================
       */

      if (!this.io) {

        logger.warn(

          "Realtime bus has no io instance"

        );

        return false;

      }

      /**
       * ==========================================
       * NORMALIZE EVENT
       * ==========================================
       */

      const normalizedEvent = {

        ...realtimeEvent,

        timestamp:
          realtimeEvent.timestamp ||

          new Date().toISOString(),

      };

      /**
       * ==========================================
       * METRICS
       * ==========================================
       */

      trackRealtimePublished({

        channel:
          normalizedEvent.channel ||

          normalizedEvent.event,

      });

      /**
       * ==========================================
       * DISPATCH
       * ==========================================
       */

      dispatchRealtimeEvent({

        io: this.io,

        realtimeEvent:
          normalizedEvent,

      });

      /**
       * ==========================================
       * INTERNAL EVENT BUS
       * ==========================================
       */

      this.emit(

        normalizedEvent.event,

        normalizedEvent

      );

      return true;

    } catch (error) {

      logger.error(

        "Realtime publish failed",

        {

          message:
            error.message,

          stack:
            error.stack,

          event:
            realtimeEvent?.event,

        }

      );

      return false;

    }

  }

}

/**
 * =====================================================
 * SINGLETON
 * =====================================================
 */

const realtimeEventBus =
  new RealtimeEventBus();

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  realtimeEventBus,

};