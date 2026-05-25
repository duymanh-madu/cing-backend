let maintenanceState =
  {

    enabled: false,

    message:
      null,

    updated_at:
      Date.now(),

  };

/**
 * =====================================================
 * ENABLE MAINTENANCE
 * =====================================================
 */

function enableMaintenance({
  message,
}) {

  maintenanceState = {

    enabled: true,

    message:
      message ||

      "System maintenance",

    updated_at:
      Date.now(),

  };

  return maintenanceState;

}

/**
 * =====================================================
 * DISABLE MAINTENANCE
 * =====================================================
 */

function disableMaintenance() {

  maintenanceState = {

    enabled: false,

    message: null,

    updated_at:
      Date.now(),

  };

  return maintenanceState;

}

/**
 * =====================================================
 * GET STATE
 * =====================================================
 */

function getMaintenanceState() {

  return maintenanceState;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  enableMaintenance,

  disableMaintenance,

  getMaintenanceState,

};