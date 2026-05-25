const logger =
  require(
    "../../services/loggerService"
  );

const {

  getActiveSessions,

} = require(
  "../../services/personalization/sessionIntelligenceService"
);

/**
 * =====================================================
 * START PERSONALIZATION WORKER
 * =====================================================
 */

async function startPersonalizationRuntimeWorker() {

  logger.info(
    "[PERSONALIZATION] Worker started"
  );

  setInterval(
    async () => {

      try {

        const sessions =
          getActiveSessions();

        logger.info(
          "[PERSONALIZATION] Runtime processing",
          {
            active_sessions:
              sessions.length,
          }
        );

      } catch (error) {

        logger.error(
          "[PERSONALIZATION] Worker failed",
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

  startPersonalizationRuntimeWorker,

};const logger =
  require(
    "../../services/loggerService"
  );

const {

  getActiveSessions,

} = require(
  "../../services/personalization/sessionIntelligenceService"
);

/**
 * =====================================================
 * START PERSONALIZATION WORKER
 * =====================================================
 */

async function startPersonalizationRuntimeWorker() {

  logger.info(
    "[PERSONALIZATION] Worker started"
  );

  setInterval(
    async () => {

      try {

        const sessions =
          getActiveSessions();

        logger.info(
          "[PERSONALIZATION] Runtime processing",
          {
            active_sessions:
              sessions.length,
          }
        );

      } catch (error) {

        logger.error(
          "[PERSONALIZATION] Worker failed",
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

  startPersonalizationRuntimeWorker,

};