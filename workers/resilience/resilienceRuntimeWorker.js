const logger =
  require(
    "../../services/loggerService"
  );

const {

  getRuntimeSnapshots,

} = require(
  "../../services/resilience/distributedBackupService"
);

const {

  getConsistencyReports,

} = require(
  "../../services/resilience/runtimeConsistencyService"
);

/**
 * =====================================================
 * START RESILIENCE WORKER
 * =====================================================
 */

async function startResilienceRuntimeWorker() {

  logger.info(
    "[RESILIENCE] Worker started"
  );

  setInterval(
    async () => {

      try {

        const snapshots =
          getRuntimeSnapshots();

        const reports =
          getConsistencyReports();

        logger.info(
          "[RESILIENCE] Runtime monitoring",
          {

            snapshots:
              snapshots.length,

            consistency_reports:
              reports.length,

          }
        );

      } catch (error) {

        logger.error(
          "[RESILIENCE] Worker failed",
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

  startResilienceRuntimeWorker,

};