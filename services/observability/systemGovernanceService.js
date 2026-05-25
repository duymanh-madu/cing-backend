const governanceState = {

  maintenance_mode: false,

  emergency_shutdown: false,

  feature_toggles: {},

};

/**
 * =====================================================
 * SET MAINTENANCE MODE
 * =====================================================
 */

function setMaintenanceMode(
  enabled
) {

  governanceState
    .maintenance_mode =
      enabled;

}

/**
 * =====================================================
 * SET EMERGENCY SHUTDOWN
 * =====================================================
 */

function setEmergencyShutdown(
  enabled
) {

  governanceState
    .emergency_shutdown =
      enabled;

}

/**
 * =====================================================
 * SET FEATURE TOGGLE
 * =====================================================
 */

function setFeatureToggle({

  feature,

  enabled,

}) {

  governanceState
    .feature_toggles[
      feature
    ] = enabled;

}

/**
 * =====================================================
 * GET GOVERNANCE STATE
 * =====================================================
 */

function getGovernanceState() {

  return governanceState;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  setMaintenanceMode,

  setEmergencyShutdown,

  setFeatureToggle,

  getGovernanceState,

};