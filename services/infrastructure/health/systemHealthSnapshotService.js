const {

  getDeadEvents,

} = require(

  "../../../core/bus/deadLetterEventQueue"

);

const {

  getAllMetrics,

} = require(

  "../metrics/centralMetricsRegistry"

);

const {

  getSocketMetrics,

} = require(

  "../metrics/socketRealtimeMetricsService"

);

const {

  getLatencyMetrics,

} = require(

  "../metrics/requestLatencyService"

);

const {

  getEventExecutionMetrics,

} = require(

  "../metrics/eventExecutionMetricsService"

);

const {

  calculateHealthGrade,

} = require(

  "./healthGradingService"

);

const {

  getSystemMetrics,

} = require(

  "../metrics/systemMetricsService"

);

const {

  getRuntimeMetrics,

} = require(

  "../metrics/runtimeMetricsService"

);

const {

  getProcessMetrics,

} = require(

  "../metrics/processMetricsService"

);

const {

  getWorkers,

} = require(

  "../metrics/workerMetricsService"

);

const {

  getSocketPresence,

} = require(

  "../../realtime/socketPresenceService"

);

const logger =
  require(
    "../../../services/loggerService"
  );

/**
 * =====================================================
 * SAFE EXECUTE
 * =====================================================
 */

function safeExecute(

  callback,

  fallback

) {

  try {

    return callback();

  } catch (error) {

    logger.error(

      "Health snapshot section failed",

      {

        error:
          error.message,

      }

    );

    return fallback;

  }

}

/**
 * =====================================================
 * SYSTEM HEALTH SNAPSHOT
 * =====================================================
 */

function getSystemHealthSnapshot() {

  /**
   * ============================================
   * CORE METRICS
   * ============================================
   */

  const runtime =
    safeExecute(

      () =>
        getRuntimeMetrics(),

      {}

    );

  const process =
    safeExecute(

      () =>
        getProcessMetrics(),

      {}

    );

  const system =
    safeExecute(

      () =>
        getSystemMetrics(),

      {}

    );

  /**
   * ============================================
   * HEALTH GRADE
   * ============================================
   */

  const status =
    safeExecute(

      () =>

        calculateHealthGrade({

          memoryUsage:
            runtime.memory_usage,

          activeRequests:
            process.active_requests,

        }),

      "unknown"

    );

  /**
   * ============================================
   * SOCKETS
   * ============================================
   */

  const socketPresence =
    safeExecute(

      () =>
        getSocketPresence(),

      []

    );

  const socketMetrics =
    safeExecute(

      () =>
        getSocketMetrics(),

      {}

    );

  /**
   * ============================================
   * FINAL SNAPSHOT
   * ============================================
   */

  return {

    status,

    timestamp:
      new Date()
        .toISOString(),

    /**
     * ========================================
     * SYSTEM
     * ========================================
     */

    system,

    runtime,

    process,

    /**
     * ========================================
     * WORKERS
     * ========================================
     */

    workers:
      safeExecute(

        () =>
          getWorkers(),

        {}

      ),

    /**
     * ========================================
     * SOCKETS
     * ========================================
     */

    sockets: {

      metrics:
        socketMetrics,

      active_presence:
        socketPresence,

      active_count:
        socketPresence.length,

    },

    /**
     * ========================================
     * REQUEST LATENCY
     * ========================================
     */

    latency:
      safeExecute(

        () =>
          getLatencyMetrics(),

        {}

      ),

    /**
     * ========================================
     * EVENT EXECUTION
     * ========================================
     */

    events:
      safeExecute(

        () =>
          getEventExecutionMetrics(),

        {}

      ),

    /**
     * ========================================
     * DEAD LETTERS
     * ========================================
     */

    dead_letters:
      safeExecute(

        () =>
          getDeadEvents(),

        []

      ),

    /**
     * ========================================
     * CENTRAL METRICS
     * ========================================
     */

    metrics:
      safeExecute(

        () =>
          getAllMetrics(),

        {}

      ),

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  getSystemHealthSnapshot,

};