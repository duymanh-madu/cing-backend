const runtimeHealth =
  new Map();

/**
 * =====================================================
 * UPDATE HEALTH STATE
 * =====================================================
 */

function updateRuntimeHealth({

  service,

  status,

  metadata = {},

}) {

  runtimeHealth.set(

    service,

    {

      service,

      status,

      metadata,

      updated_at:
        Date.now(),

    }

  );

}

/**
 * =====================================================
 * GET HEALTH STATE
 * =====================================================
 */

function getRuntimeHealth(
  service
) {

  return (
    runtimeHealth.get(
      service
    ) || null
  );

}

/**
 * =====================================================
 * GET ALL HEALTH STATES
 * =====================================================
 */

function getAllRuntimeHealth() {

  return Array.from(
    runtimeHealth.values()
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  updateRuntimeHealth,

  getRuntimeHealth,

  getAllRuntimeHealth,

};