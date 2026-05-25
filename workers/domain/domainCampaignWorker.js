const logger =
  require(
    "../../services/loggerService"
  );

/**
 * =====================================================
 * CAMPAIGN WORKER
 * =====================================================
 */

async function startDomainCampaignWorker() {

  logger.info(
    "[DOMAIN] Campaign worker started"
  );

  setInterval(
    async () => {

      try {

        logger.info(
          "[DOMAIN] Campaign processing"
        );

      } catch (error) {

        logger.error(
          "[DOMAIN] Campaign worker failed",
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

  startDomainCampaignWorker,

};