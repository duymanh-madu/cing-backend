const logger =
  require(
    "../../services/loggerService"
  );

const {

  getAutomationRules,

} = require(
  "../../services/automation/smartAutomationRuleService"
);

/**
 * =====================================================
 * START AUTOMATION WORKER
 * =====================================================
 */

async function startAutomationExecutionWorker() {

  logger.info(
    "[AUTOMATION] Worker started"
  );

  setInterval(
    async () => {

      try {

        const rules =
          getAutomationRules();

        logger.info(
          "[AUTOMATION] Executing rules",
          {
            total_rules:
              rules.length,
          }
        );

      } catch (error) {

        logger.error(
          "[AUTOMATION] Worker failed",
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

  startAutomationExecutionWorker,

};