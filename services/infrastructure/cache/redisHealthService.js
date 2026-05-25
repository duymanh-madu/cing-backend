const createRedisClient = require("./redisClient");

const getRedisHealth = async () => {
  try {
    const redis = createRedisClient();

    const pong = await redis.ping();

    return {
      success: true,
      status: pong,
      provider: "Redis Cloud",
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = {
  getRedisHealth,
};