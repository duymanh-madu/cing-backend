const resilienceStates =
  new Map();

/**
 * =====================================================
 * OPEN CIRCUIT
 * =====================================================
 */

function openCircuit({

  service,

  reason,

}) {

  resilienceStates.set(

    service,

    {

      state:
        "open",

      reason,

      updated_at:
        Date.now(),

    }

  );

}

/**
 * =====================================================
 * CLOSE CIRCUIT
 * =====================================================
 */

function closeCircuit(
  service
) {

  resilienceStates.set(

    service,

    {

      state:
        "closed",

      updated_at:
        Date.now(),

    }

  );

}

/**
 * =====================================================
 * GET CIRCUIT STATE
 * =====================================================
 */

function getCircuitState(
  service
) {

  return (

    resilienceStates.get(
      service
    ) || {

      state:
        "closed",

    }

  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  openCircuit,

  closeCircuit,

  getCircuitState,

};