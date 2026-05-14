const socketMetrics = {

  active_connections: 0,

  total_connections: 0,

  total_disconnections: 0,

  socket_errors: 0,

};

/**
 * =====================================================
 * SOCKET CONNECTED
 * =====================================================
 */

function trackSocketConnected() {

  socketMetrics.active_connections += 1;

  socketMetrics.total_connections += 1;

}

/**
 * =====================================================
 * SOCKET DISCONNECTED
 * =====================================================
 */

function trackSocketDisconnected() {

  socketMetrics.active_connections -= 1;

  socketMetrics.total_disconnections += 1;

  if (

    socketMetrics.active_connections < 0

  ) {

    socketMetrics.active_connections = 0;

  }

}

/**
 * =====================================================
 * SOCKET ERROR
 * =====================================================
 */

function trackSocketError() {

  socketMetrics.socket_errors += 1;

}

/**
 * =====================================================
 * GET SOCKET METRICS
 * =====================================================
 */

function getSocketMetrics() {

  return socketMetrics;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  trackSocketConnected,

  trackSocketDisconnected,

  trackSocketError,

  getSocketMetrics,

};