const systemMetrics = {

  websocket_connections: 0,

  active_workers: 0,

  processed_events: 0,

  failed_events: 0,

  redis_latency: 0,

  queue_backlog: 0,

  delivery_failures: 0,

  commerce_operations: 0,

};

/**
 * =====================================================
 * INCREMENT METRIC
 * =====================================================
 */

function incrementMetric(
  key,
  value = 1
) {

  if (
    typeof systemMetrics[
      key
    ] !== "number"
  ) {

    return;

  }

  systemMetrics[
    key
  ] += value;

}

/**
 * =====================================================
 * SET METRIC
 * =====================================================
 */

function setMetric(
  key,
  value
) {

  systemMetrics[
    key
  ] = value;

}

/**
 * =====================================================
 * GET METRICS
 * =====================================================
 */

function getSystemMetrics() {

  return systemMetrics;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  incrementMetric,

  setMetric,

  getSystemMetrics,

};