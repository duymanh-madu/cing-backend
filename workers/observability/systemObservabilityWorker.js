const logger =
  require(
    "../../services/loggerService"
  );

const {

  getSystemMetrics,

} = require(
  "../../services/observability/systemMetricsService"
);

const {

  getAllRuntimeHealth,

} = require(
  "../../services/observability/runtimeHealthService"
);

/**
 * =====================================================
 * START OBSERVABILITY WORKER
 * =====================================================
 */

async function startSystemObservabilityWorker() {

  logger.info(
    "[OBSERVABILITY] Worker started"
  );

  setInterval(
    async () => {

      try {

        const metrics =
          getSystemMetrics();

        const health =
          getAllRuntimeHealth();

        logger.info(
          "[OBSERVABILITY] Runtime monitoring",
          {

            websocket_connections:
              metrics.websocket_connections,

            active_workers:
              metrics.active_workers,

            health_services:
              health.length,

          }
        );

      } catch (error) {

        logger.error(
          "[OBSERVABILITY] Worker failed",
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

  startSystemObservabilityWorker,

};