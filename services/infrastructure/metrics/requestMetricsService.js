const metrics =
  require("./metricsStore");

function trackRequestSuccess() {

  metrics.requests.total += 1;

  metrics.requests.success += 1;

}

function trackRequestFailed() {

  metrics.requests.total += 1;

  metrics.requests.failed += 1;

}

module.exports = {

  trackRequestSuccess,

  trackRequestFailed,

};