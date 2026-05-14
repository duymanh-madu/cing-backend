const latencyMetrics = {

  total_requests: 0,

  total_duration: 0,

  slow_requests: 0,

  average_duration: 0,

};

/**
 * =====================================================
 * TRACK REQUEST LATENCY
 * =====================================================
 */

function trackRequestLatency(

  duration

) {

  latencyMetrics.total_requests += 1;

  latencyMetrics.total_duration += duration;

  latencyMetrics.average_duration =

    latencyMetrics.total_duration /

    latencyMetrics.total_requests;

  /**
   * ============================================
   * SLOW REQUEST
   * ============================================
   */

  if (duration > 1000) {

    latencyMetrics.slow_requests += 1;

  }

}

/**
 * =====================================================
 * GET LATENCY METRICS
 * =====================================================
 */

function getLatencyMetrics() {

  return latencyMetrics;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  trackRequestLatency,

  getLatencyMetrics,

};