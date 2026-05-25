const logger =
  require(
    "../../services/loggerService"
  );

const {

  getDeliveryEvents,

} = require(
  "../../services/communication/deliveryIntelligenceService"
);

/**
 * =====================================================
 * START COMMUNICATION WORKER
 * =====================================================
 */

async function startCommunicationDeliveryWorker() {

  logger.info(
    "[COMMUNICATION] Worker started"
  );

  setInterval(
    async () => {

      try {

        const events =
          getDeliveryEvents();

        logger.info(
          "[COMMUNICATION] Delivery processing",
          {
            delivery_events:
              events.length,
          }
        );

      } catch (error) {

        logger.error(
          "[COMMUNICATION] Worker failed",
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

  startCommunicationDeliveryWorker,

};