const logger =
  require(
    "../../services/loggerService"
  );

/**
 * =====================================================
 * CRM WORKER
 * =====================================================
 */

async function startDomainCrmWorker() {

  logger.info(
    "[DOMAIN] CRM worker started"
  );

  setInterval(
    async () => {

      try {

        logger.info(
          "[DOMAIN] CRM sync processing"
        );

      } catch (error) {

        logger.error(
          "[DOMAIN] CRM worker failed",
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

  startDomainCrmWorker,

};