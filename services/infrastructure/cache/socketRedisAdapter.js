const { createAdapter } = require("@socket.io/redis-adapter");

const publisher = require("./redisPublisher");

const subscriber = require("./redisSubscriber");

const attachRedisAdapter = (io) => {

  io.adapter(
    createAdapter(
      publisher,
      subscriber
    )
  );

  console.log(
    "🔌 Socket Redis Adapter attached"
  );

};

module.exports =
  attachRedisAdapter;