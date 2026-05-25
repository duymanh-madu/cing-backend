const logger =
  require(
    "../../services/loggerService"
  );

const {

  getDeliveryRecoveryLogs,

} = require(
  "../../services/delivery/deliveryRecoveryService"
);

/**
 * =====================================================
 * START DELIVERY RUNTIME WORKER
 * =====================================================
 */

async function startDeliveryRuntimeWorker() {

  logger.info(
    "[DELIVERY] Worker started"
  );

  setInterval(
    async () => {

      try {

        const recoveryLogs =
          getDeliveryRecoveryLogs();

        logger.info(
          "[DELIVERY] Runtime processing",
          {
            recovery_logs:
              recoveryLogs.length,
          }
        );

      } catch (error) {

        logger.error(
          "[DELIVERY] Worker failed",
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

  startDeliveryRuntimeWorker,

};