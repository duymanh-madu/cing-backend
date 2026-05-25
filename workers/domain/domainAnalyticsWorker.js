const logger =
  require(
    "../../services/loggerService"
  );

/**
 * =====================================================
 * ANALYTICS WORKER
 * =====================================================
 */

async function startDomainAnalyticsWorker() {

  logger.info(
    "[DOMAIN] Analytics worker started"
  );

  setInterval(
    async () => {

      try {

        logger.info(
          "[DOMAIN] Analytics processing"
        );

      } catch (error) {

        logger.error(
          "[DOMAIN] Analytics worker failed",
          {
            message:
              error.message,
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

  startDomainAnalyticsWorker,

};