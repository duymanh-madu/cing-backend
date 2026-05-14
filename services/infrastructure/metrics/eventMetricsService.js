const metrics = {

  emitted: 0,

  success: 0,

  failed: 0,

  failures: [],

};

function trackEventEmitted() {

  metrics.emitted += 1;

}

function trackEventSuccess() {

  metrics.success += 1;

}

function trackEventFailed() {

  metrics.failed += 1;

}

function trackEventFailure(
  data
) {

  metrics.failures.unshift({

    ...data,

    created_at:
      new Date(),

  });

  if (

    metrics.failures.length > 100

  ) {

    metrics.failures.pop();

  }

}

function getEventMetrics() {

  return metrics;

}

module.exports = {

  trackEventEmitted,

  trackEventSuccess,

  trackEventFailed,

  trackEventFailure,

  getEventMetrics,

};