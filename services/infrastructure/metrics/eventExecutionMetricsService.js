const metrics = {

  total_events: 0,

  failed_events: 0,

  slow_events: 0,

  total_duration: 0,

};

/**
 * =====================================================
 * TRACK EVENT EXECUTION
 * =====================================================
 */

function trackEventExecution({

  duration,

  success = true,

}) {

  metrics.total_events += 1;

  metrics.total_duration += duration;

  if (!success) {

    metrics.failed_events += 1;

  }

  if (duration > 1000) {

    metrics.slow_events += 1;

  }

}

/**
 * =====================================================
 * GET EVENT EXECUTION METRICS
 * =====================================================
 */

function getEventExecutionMetrics() {

  return {

    ...metrics,

    average_duration:

      metrics.total_events > 0

        ? metrics.total_duration /

          metrics.total_events

        : 0,

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  trackEventExecution,

  getEventExecutionMetrics,

};