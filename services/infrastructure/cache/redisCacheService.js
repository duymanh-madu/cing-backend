const createRedisClient = require("./redisClient");

const redis = createRedisClient();

const setCache = async (
  key,
  value,
  ttl = null
) => {
  const serialized = JSON.stringify(value);

  if (ttl) {
    await redis.set(key, serialized, "EX", ttl);
    return;
  }

  await redis.set(key, serialized);
};

const getCache = async (key) => {
  const value = await redis.get(key);

  if (!value) {
    return null;
  }

  return JSON.parse(value);
};

const deleteCache = async (key) => {
  await redis.del(key);
};

const clearCacheByPattern = async (
  pattern
) => {
  const keys = await redis.keys(pattern);

  if (!keys.length) {
    return;
  }

  await redis.del(keys);
};

module.exports = {
  setCache,
  getCache,
  deleteCache,
  clearCacheByPattern,
};