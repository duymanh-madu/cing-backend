const Redis =
  require("ioredis");

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
 * CONFIG
 * =====================================================
 */

const WEBHOOK_TTL =
  60 * 10;

/**
 * =====================================================
 * BUILD KEY
 * =====================================================
 */

function buildWebhookKey({

  transaction_code,

  provider_transaction_id,

}) {

  return (

    "payment:webhook:" +

    transaction_code +

    ":" +

    provider_transaction_id

  );

}

/**
 * =====================================================
 * CHECK REPLAY ATTACK
 * =====================================================
 */

async function isReplayWebhook({

  transaction_code,

  provider_transaction_id,

}) {

  const key =
    buildWebhookKey({

      transaction_code,

      provider_transaction_id,

    });

  const exists =
    await redis.exists(
      key
    );

  return exists === 1;

}

/**
 * =====================================================
 * SAVE WEBHOOK
 * =====================================================
 */

async function saveWebhookFingerprint({

  transaction_code,

  provider_transaction_id,

}) {

  const key =
    buildWebhookKey({

      transaction_code,

      provider_transaction_id,

    });

  await redis.set(

    key,

    "processed",

    "EX",

    WEBHOOK_TTL

  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  isReplayWebhook,

  saveWebhookFingerprint,

};