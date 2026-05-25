const {

  startPaymentRetryWorker,

} = require(
  "../../workers/paymentRetryWorker"
);

const {

  startPaymentRecoveryWorker,

} = require(
  "../../workers/paymentRecoveryWorker"
);

const {

  startDeadLetterWorker,

} = require(
  "../../workers/paymentDeadLetterWorker"
);

const logger =
  require(
    "../loggerService"
  );

/**
 * =====================================================
 * WORKER REGISTRY
 * =====================================================
 */

async function initializePaymentWorkers() {

  logger.info(
    "[PAYMENT] Initializing workers"
  );

  await startPaymentRetryWorker();

  await startPaymentRecoveryWorker();

  await startDeadLetterWorker();

  logger.info(
    "[PAYMENT] Workers initialized"
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  initializePaymentWorkers,

};