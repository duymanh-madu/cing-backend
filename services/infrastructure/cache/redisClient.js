const Redis = require("ioredis");

const redisClient = new Redis(
  process.env.REDIS_URL,
  {

    maxRetriesPerRequest: null,

    enableReadyCheck: true,

    retryStrategy(times) {

      return Math.min(
        times * 100,
        3000
      );

    },

    reconnectOnError() {

      return true;

    },

  }
);

redisClient.on(
  "connect",
  () => {

    console.log(
      "✅ Redis connected"
    );

  }
);

redisClient.on(
  "ready",
  () => {

    console.log(
      "🚀 Redis ready"
    );

  }
);

redisClient.on(
  "error",
  (error) => {

    console.error(
      "❌ Redis error:",
      error.message
    );

  }
);

module.exports =
  redisClient;