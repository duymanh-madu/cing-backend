const logger =
  require(
    "../../services/loggerService"
  );

const {

  aggregateAnalytics,

} = require(
  "../../services/analytics/analyticsAggregationService"
);

/**
 * =====================================================
 * ANALYTICS AGGREGATION WORKER
 * =====================================================
 */

async function startAnalyticsAggregationWorker() {

  logger.info(
    "[ANALYTICS] Aggregation worker started"
  );

  setInterval(
    async () => {

      try {

        const result =
          aggregateAnalytics();

        logger.info(
          "[ANALYTICS] Aggregation completed",
          {
            total_events:
              result
                .aggregation
                .total_events,
          }
        );

      } catch (error) {

        logger.error(
          "[ANALYTICS] Aggregation worker failed",
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

  startAnalyticsAggregationWorker,

};