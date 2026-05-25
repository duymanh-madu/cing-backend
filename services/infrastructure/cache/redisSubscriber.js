const redisClient =
  require("./redisClient");

const subscriber =
  redisClient.duplicate();

module.exports =
  subscriber;