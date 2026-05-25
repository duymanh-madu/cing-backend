const Redis = require("ioredis");

const redis = new Redis(process.env.REDIS_URL);

const QUEUE_KEY = "sync:crm:queue";

class SyncQueue {

  async push(job) {
    await redis.lpush(QUEUE_KEY, JSON.stringify(job));
  }

  async pop() {
    const data = await redis.rpop(QUEUE_KEY);
    return data ? JSON.parse(data) : null;
  }

  async size() {
    return await redis.llen(QUEUE_KEY);
  }

}

module.exports = new SyncQueue();
