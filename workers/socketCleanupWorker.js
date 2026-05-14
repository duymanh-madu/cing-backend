const {
  cleanupStaleSockets,
} = require(
  "../services/realtime/socketCleanupService"
);

const logger =
  require(
    "../services/loggerService"
  );

/**
 * =====================================================
 * START SOCKET CLEANUP WORKER
 * =====================================================
 */

function startSocketCleanupWorker() {

  setInterval(
    () => {

      try {

        const result =
          cleanupStaleSockets();

        if (
          result.cleaned > 0
        ) {

          logger.warn(
            "Stale sockets removed",
            result
          );

        }

      } catch (error) {

        logger.error(
          "Socket cleanup failed",
          {

            error:
              error.message,

          }
        );

      }

    },

    30000
  );

  logger.info(
    "Socket cleanup worker started"
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  startSocketCleanupWorker,

};