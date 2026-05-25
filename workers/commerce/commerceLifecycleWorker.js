const logger =
  require(
    "../../services/loggerService"
  );

const {

  getCommerceQueue,

} = require(
  "../../services/commerce/commerceQueueOrchestratorService"
);

/**
 * =====================================================
 * START COMMERCE WORKER
 * =====================================================
 */

async function startCommerceLifecycleWorker() {

  logger.info(
    "[COMMERCE] Worker started"
  );

  setInterval(
    async () => {

      try {

        const paymentQueue =
          getCommerceQueue(
            "payment_sync"
          );

        const crmQueue =
          getCommerceQueue(
            "crm_sync"
          );

        logger.info(
          "[COMMERCE] Lifecycle processing",
          {

            payment_jobs:
              paymentQueue.length,

            crm_jobs:
              crmQueue.length,

          }
        );

      } catch (error) {

        logger.error(
          "[COMMERCE] Worker failed",
          {
            message:
              error.message,
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

  startCommerceLifecycleWorker,

};