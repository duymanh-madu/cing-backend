async function getRuntimeConfig() {

  return {

    environment:
      process.env.NODE_ENV,

    appVersion:
      process.env.APP_VERSION ||
      "1.0.0",

    realtime: true,

    websocket: true,

    platform:
      "zalo-mini-app",

  };

}

async function getRuntimeFeatures() {

  return {

    loyalty: true,

    vouchers: true,

    minigame: true,

    leaderboard: true,

    realtimeNotifications: true,

    crmSync: true,

  };

}

async function getRuntimeVersion() {

  return {

    version:
      process.env.APP_VERSION ||
      "1.0.0",

    buildTime:
      Date.now(),

  };

}

async function getRuntimeMetrics() {

  return {

    uptime:
      process.uptime(),

    memory:
      process.memoryUsage(),

    pid:
      process.pid,

  };

}

async function getSocketHealth() {

  return {

    realtime: true,

    socket: "healthy",

    timestamp:
      Date.now(),

  };

}

module.exports = {

  getRuntimeConfig,
  getRuntimeFeatures,
  getRuntimeVersion,
  getRuntimeMetrics,
  getSocketHealth,

};