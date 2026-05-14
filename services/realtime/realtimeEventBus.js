const EventEmitter =
  require(
    "events"
  );

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

    this.io = null;

  }

  /**
   * ============================================
   * SET IO
   * ============================================
   */

  setIO(io) {

    this.io = io;

  }

  /**
   * ============================================
   * PUBLISH
   * ============================================
   */

  publish(
    realtimeEvent
  ) {

    if (!this.io) {

      logger.warn(

        "Realtime bus has no io instance"

      );

      return;

    }

    trackRealtimePublished({

      channel:
        realtimeEvent.channel,

    });

    dispatchRealtimeEvent({

      io: this.io,

      realtimeEvent,

    });

    this.emit(

      realtimeEvent.event,

      realtimeEvent

    );

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