const redisClient =
  require("./redisClient");

const publisher =
  redisClient.duplicate();

module.exports =
  publisher;