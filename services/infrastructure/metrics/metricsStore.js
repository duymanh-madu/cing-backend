const metrics = {

  requests: {
    total: 0,
    success: 0,
    failed: 0,
  },

  events: {
    emitted: 0,
    success: 0,
    failed: 0,
  },

  queues: {
    pushed: 0,
    processed: 0,
    failed: 0,
  },

  workers: {},

  sockets: {
    connected: 0,
    disconnected: 0,
  },

};

module.exports = metrics;