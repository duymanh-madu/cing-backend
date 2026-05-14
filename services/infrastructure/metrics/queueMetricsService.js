const metrics =
  require("./metricsStore");

function trackQueuePushed() {

  metrics.queues.pushed += 1;

}

function trackQueueProcessed() {

  metrics.queues.processed += 1;

}

function trackQueueFailed() {

  metrics.queues.failed += 1;

}

module.exports = {

  trackQueuePushed,

  trackQueueProcessed,

  trackQueueFailed,

};