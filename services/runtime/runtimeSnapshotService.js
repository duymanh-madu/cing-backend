const {

  getRuntimeConfig,

} = require(
  "../admin/adminRuntimeConfigService"
);

const {

  getFeatureFlags,

} = require(
  "../admin/adminFeatureFlagService"
);

const {

  getMaintenanceState,

} = require(
  "../admin/adminMaintenanceService"
);

/**
 * =====================================================
 * GET RUNTIME SNAPSHOT
 * =====================================================
 */

function getRuntimeSnapshot() {

  return {

    runtime:
      getRuntimeConfig(),

    features:
      getFeatureFlags(),

    maintenance:
      getMaintenanceState(),

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

  getRuntimeSnapshot,

};