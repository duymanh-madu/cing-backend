const {

  processRecoveryQueue,

} = require(
  "../services/payment/paymentRecoveryService"
);

const logger =
  require(
    "../services/loggerService"
  );

/**
 * =====================================================
 * PAYMENT RECOVERY WORKER
 * =====================================================
 */

async function startPaymentRecoveryWorker() {

  logger.info(
    "[WORKER] Payment recovery worker started"
  );

  setInterval(
    async () => {

      try {

        await processRecoveryQueue();

      } catch (error) {

        logger.error(
          "[WORKER] Recovery worker failed",
          {
            message:
              error.message,

            stack:
              error.stack,
          }
        );

      }

    },
    10000
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  startPaymentRecoveryWorker,

};