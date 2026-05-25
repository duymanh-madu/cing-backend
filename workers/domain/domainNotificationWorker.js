const logger =
  require(
    "../../services/loggerService"
  );

/**
 * =====================================================
 * NOTIFICATION WORKER
 * =====================================================
 */

async function startDomainNotificationWorker() {

  logger.info(
    "[DOMAIN] Notification worker started"
  );

  setInterval(
    async () => {

      try {

        logger.info(
          "[DOMAIN] Notification processing"
        );

      } catch (error) {

        logger.error(
          "[DOMAIN] Notification worker failed",
          {
            message:
              error.message,
          }
        );

      }

    },
    12000
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  startDomainNotificationWorker,

};