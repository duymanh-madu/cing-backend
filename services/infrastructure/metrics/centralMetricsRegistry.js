const {

  getEventMetrics,

} = require(
  "./eventMetricsService"
);

const {

  getLatencyMetrics,

} = require(
  "./requestLatencyService"
);

const {

  getSocketMetrics,

} = require(
  "./socketRealtimeMetricsService"
);

const {

  getWorkers,

} = require(
  "./workerMetricsService"
);

const {

  getEventExecutionMetrics,

} = require(
  "./eventExecutionMetricsService"
);

/**
 * =====================================================
 * GET ALL METRICS
 * =====================================================
 */

function getAllMetrics() {

  return {

    requests:
      getLatencyMetrics(),

    sockets:
      getSocketMetrics(),

    workers:
      getWorkers(),

    events:
      getEventMetrics(),

    executions:
      getEventExecutionMetrics(),

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  getAllMetrics,

};