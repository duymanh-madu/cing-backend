const {

  getDeadPaymentEvents,

} = require(
  "../services/payment/paymentDeadLetterService"
);

const logger =
  require(
    "../services/loggerService"
  );

/**
 * =====================================================
 * DEAD LETTER WORKER
 * =====================================================
 */

async function startDeadLetterWorker() {

  logger.info(
    "[WORKER] Dead letter worker started"
  );

  setInterval(
    async () => {

      try {

        const deadLetters =
          getDeadPaymentEvents();

        if (
          !deadLetters.length
        ) {

          return;

        }

        logger.warn(
          "[WORKER] Dead payment events detected",
          {
            count:
              deadLetters.length,
          }
        );

      } catch (error) {

        logger.error(
          "[WORKER] Dead letter worker failed",
          {
            message:
              error.message,

            stack:
              error.stack,
          }
        );

      }

    },
    15000
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  startDeadLetterWorker,

};