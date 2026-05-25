const {

  getRealtimePaymentMetrics,

} = require(
  "./paymentRealtimeMetricsService"
);

const {

  getProviderTelemetry,

} = require(
  "./paymentProviderTelemetryService"
);

const {

  detectPaymentPressure,

} = require(
  "./paymentPressureMonitoringService"
);

/**
 * =====================================================
 * GET ADMIN TELEMETRY
 * =====================================================
 */

async function getAdminPaymentTelemetry() {

  const realtime =
    await getRealtimePaymentMetrics();

  const providers =
    await getProviderTelemetry();

  const pressure =
    await detectPaymentPressure();

  return {

    realtime,

    providers,

    pressure,

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

  getAdminPaymentTelemetry,

};