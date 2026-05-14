let totalRequests = 0;

let activeRequests = 0;

/**
 * =====================================================
 * TRACK REQUEST START
 * =====================================================
 */

function trackRequestStarted() {

  totalRequests += 1;

  activeRequests += 1;

}

/**
 * =====================================================
 * TRACK REQUEST FINISHED
 * =====================================================
 */

function trackRequestFinished() {

  activeRequests -= 1;

  if (activeRequests < 0) {

    activeRequests = 0;

  }

}

/**
 * =====================================================
 * GET PROCESS METRICS
 * =====================================================
 */

function getProcessMetrics() {

  return {

    total_requests:
      totalRequests,

    active_requests:
      activeRequests,

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  trackRequestStarted,

  trackRequestFinished,

  getProcessMetrics,

};