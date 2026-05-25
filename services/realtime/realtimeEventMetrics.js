const metrics = {

  publishedEvents:
    0,

  receivedEvents:
    0,

  errors:
    0,

};

function incrementPublished() {

  metrics.publishedEvents +=
    1;

}

function incrementReceived() {

  metrics.receivedEvents +=
    1;

}

function incrementErrors() {

  metrics.errors +=
    1;

}

function getRealtimeMetrics() {

  return {

    ...metrics,

  };

}

module.exports = {

  incrementPublished,

  incrementReceived,

  incrementErrors,

  getRealtimeMetrics,

};