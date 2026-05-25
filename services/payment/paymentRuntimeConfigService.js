const runtimeConfig = {

  maintenance_mode:
    false,

  retry_enabled:
    true,

  webhook_strict_mode:
    true,

  reconciliation_enabled:
    true,

  failover_enabled:
    true,

  realtime_broadcast:
    true,

  max_retry_attempts:
    5,

  provider_priority: [

    "momo",

    "zalopay",

    "vnpay",

    "banking",

  ],

};

/**
 * =====================================================
 * GET CONFIG
 * =====================================================
 */

function getPaymentRuntimeConfig() {

  return runtimeConfig;

}

/**
 * =====================================================
 * UPDATE CONFIG
 * =====================================================
 */

function updatePaymentRuntimeConfig(
  payload
) {

  Object.assign(
    runtimeConfig,
    payload
  );

  runtimeConfig.updated_at =
    Date.now();

  return runtimeConfig;

}

/**
 * =====================================================
 * CHECK FEATURE ENABLED
 * =====================================================
 */

function isFeatureEnabled(
  feature
) {

  return Boolean(
    runtimeConfig[
      feature
    ]
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  getPaymentRuntimeConfig,

  updatePaymentRuntimeConfig,

  isFeatureEnabled,

};