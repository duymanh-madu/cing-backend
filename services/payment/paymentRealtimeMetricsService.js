const {

  getPaymentMetrics,

} = require(
  "./paymentMetricsService"
);

const {

  getQueueTelemetry,

} = require(
  "./paymentQueueTelemetryService"
);

/**
 * =====================================================
 * GET REALTIME METRICS
 * =====================================================
 */

async function getRealtimePaymentMetrics() {

  const metrics =
    getPaymentMetrics();

  const queueTelemetry =
    await getQueueTelemetry();

  return {

    metrics,

    queues:
      queueTelemetry,

    generated_at:
      Date.now(),

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  getRealtimePaymentMetrics,

};