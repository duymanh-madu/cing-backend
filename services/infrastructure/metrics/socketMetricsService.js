const metrics = {

  connected: 0,

  disconnected: 0,

  errors: 0,

};

function trackSocketConnected() {

  metrics.connected += 1;

}

function trackSocketDisconnected() {

  metrics.disconnected += 1;

}

function trackSocketError() {

  metrics.errors += 1;

}

function getSocketMetrics() {

  return metrics;

}

module.exports = {

  trackSocketConnected,

  trackSocketDisconnected,

  trackSocketError,

  getSocketMetrics,

};