const axios =
  require("axios");

/**
 * =====================================================
 * CHECK PROVIDER LATENCY
 * =====================================================
 */

async function measureProviderLatency(
  provider,
  url
) {

  const started =
    Date.now();

  try {

    await axios.get(
      url,
      {
        timeout: 5000,
      }
    );

    return {

      provider,

      healthy: true,

      latency:
        Date.now() -
        started,

    };

  } catch (error) {

    return {

      provider,

      healthy: false,

      latency:
        Date.now() -
        started,

      error:
        error.message,

    };

  }

}

/**
 * =====================================================
 * GET PROVIDER TELEMETRY
 * =====================================================
 */

async function getProviderTelemetry() {

  const momo =
    await measureProviderLatency(

      "momo",

      "https://test-payment.momo.vn"

    );

  return {

    momo,

    checked_at:
      Date.now(),

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  getProviderTelemetry,

};