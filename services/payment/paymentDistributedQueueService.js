const Redis =
  require("ioredis");

const logger =
  require(
    "../loggerService"
  );

/**
 * =====================================================
 * REDIS
 * =====================================================
 */

const redis =
  new Redis(
    process.env.REDIS_URL
  );

/**
 * =====================================================
 * PUSH JOB
 * =====================================================
 */

async function pushDistributedJob({

  queue,

  payload,

}) {

  await redis.rpush(

    `queue:${queue}`,

    JSON.stringify(
      payload
    )

  );

  logger.info(
    "[QUEUE] Job pushed",
    {
      queue,
    }
  );

}

/**
 * =====================================================
 * POP JOB
 * =====================================================
 */

async function popDistributedJob(
  queue
) {

  const raw =
    await redis.lpop(
      `queue:${queue}`
    );

  if (!raw) {

    return null;

  }

  return JSON.parse(
    raw
  );

}

/**
 * =====================================================
 * GET QUEUE SIZE
 * =====================================================
 */

async function getQueueSize(
  queue
) {

  return redis.llen(
    `queue:${queue}`
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  pushDistributedJob,

  popDistributedJob,

  getQueueSize,

};