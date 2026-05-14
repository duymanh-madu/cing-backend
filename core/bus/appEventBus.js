const {
  pushDeadEvent,
} = require(
  "./deadLetterEventQueue"
);

const {
  executeEventRetry,
} = require(
  "../../services/infrastructure/retry/eventRetryExecutor"
);

const {
  trackEventExecution,
} = require(
  "../../services/infrastructure/metrics/eventExecutionMetricsService"
);

const EventEmitter =
  require("events");

const {

  trackEventEmitted,

  trackEventSuccess,

  trackEventFailed,

  trackEventFailure,

} = require(
  "../../services/infrastructure/metrics/eventMetricsService"
);

/**
 * =====================================================
 * APP EVENT BUS
 * =====================================================
 */

class AppEventBus extends EventEmitter {

  constructor() {

    super();

    /**
     * ============================================
     * REMOVE LISTENER LIMIT
     * ============================================
     */

    this.setMaxListeners(0);

  }

  /**
   * ===================================================
   * REGISTER EVENT
   * ===================================================
   */

  register(
    event,
    handler
  ) {

    this.on(

      event,

      async (payload) => {

        try {

          await handler(
            payload
          );

        } catch (error) {

          trackEventFailed();

          trackEventFailure({

            event,

            payload,

            error:
              error.message,

          });

          console.error(

            `[EVENT HANDLER ERROR] ${event}`,

            error.message

          );

        }

      }

    );

  }

  /**
   * ===================================================
   * EMIT ASYNC
   * ===================================================
   */

  async emitAsync(
    event,
    payload
  ) {

    trackEventEmitted();

    const listeners =
      this.listeners(
        event
      );

    if (

      !listeners.length

    ) {

      return;

    }

    for (
      const listener of listeners
    ) {
      try {
        await executeEventRetry({
  operation:
    async () =>
      listener(
        payload
      ),

});

        const start =
  Date.now();

        trackEventSuccess();

        trackEventExecution({

  duration:

    Date.now() - start,

  success: true,

});

      } catch (error) {

        trackEventFailed();

        pushDeadEvent({
  event,
  payload,
  error,
});

        trackEventExecution({
  duration:
    Date.now() - start,
  success: false,
});

        trackEventFailure({

          event,

          payload,

          error:
            error.message,

        });

        console.error(

          `[EVENT ERROR] ${event}`,

          error.message

        );

      }

    }

  }

}

/**
 * =====================================================
 * SINGLETON
 * =====================================================
 */

const appEventBus =
  new AppEventBus();

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  appEventBus;