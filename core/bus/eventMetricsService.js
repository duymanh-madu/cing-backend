const metrics = {

  total_events: 0,

  failed_events: 0,

};

function incrementEvents() {

  metrics.total_events += 1;

}

function incrementFailures() {

  metrics.failed_events += 1;

}

function getMetrics() {

  return metrics;

}

module.exports = {

  incrementEvents,

  incrementFailures,

  getMetrics,

};