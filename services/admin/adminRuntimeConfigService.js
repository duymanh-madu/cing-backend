const runtimeConfig = {

  maintenance_mode:
    false,

  payment_enabled:
    true,

  ordering_enabled:
    true,

  realtime_enabled:
    true,

  websocket_enabled:
    true,

  notification_enabled:
    true,

  campaign_enabled:
    true,

  game_enabled:
    true,

  leaderboard_enabled:
    true,

  cms_enabled:
    true,

  analytics_enabled:
    true,

  updated_at:
    Date.now(),

};

/**
 * =====================================================
 * GET CONFIG
 * =====================================================
 */

function getRuntimeConfig() {

  return runtimeConfig;

}

/**
 * =====================================================
 * UPDATE CONFIG
 * =====================================================
 */

function updateRuntimeConfig(
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
 * EXPORTS
 * =====================================================
 */

module.exports = {

  getRuntimeConfig,

  updateRuntimeConfig,

};