const circuitStates =
  new Map();

/**
 * =====================================================
 * CONFIG
 * =====================================================
 */

const FAILURE_THRESHOLD =
  5;

const RECOVERY_TIMEOUT =
  1000 * 30;

/**
 * =====================================================
 * DEFAULT STATE
 * =====================================================
 */

function getDefaultState() {

  return {

    failures: 0,

    successes: 0,

    state: "CLOSED",

    opened_at: null,

    updated_at:
      Date.now(),

  };

}

/**
 * =====================================================
 * GET CIRCUIT
 * =====================================================
 */

function getCircuitState(
  provider
) {

  if (
    !circuitStates.has(
      provider
    )
  ) {

    circuitStates.set(
      provider,
      getDefaultState()
    );

  }

  return circuitStates.get(
    provider
  );

}

/**
 * =====================================================
 * MARK SUCCESS
 * =====================================================
 */

function markProviderSuccess(
  provider
) {

  const current =
    getCircuitState(
      provider
    );

  current.successes += 1;

  current.failures = 0;

  current.state =
    "CLOSED";

  current.updated_at =
    Date.now();

  circuitStates.set(
    provider,
    current
  );

  return current;

}

/**
 * =====================================================
 * MARK FAILURE
 * =====================================================
 */

function markProviderFailure(
  provider
) {

  const current =
    getCircuitState(
      provider
    );

  current.failures += 1;

  current.updated_at =
    Date.now();

  if (
    current.failures >=
    FAILURE_THRESHOLD
  ) {

    current.state =
      "OPEN";

    current.opened_at =
      Date.now();

  }

  circuitStates.set(
    provider,
    current
  );

  return current;

}

/**
 * =====================================================
 * CHECK PROVIDER AVAILABLE
 * =====================================================
 */

function canProviderExecute(
  provider
) {

  const current =
    getCircuitState(
      provider
    );

  /**
   * CLOSED
   */

  if (
    current.state ===
    "CLOSED"
  ) {

    return true;

  }

  /**
   * HALF OPEN
   */

  if (
    current.state ===
    "HALF_OPEN"
  ) {

    return true;

  }

  /**
   * OPEN
   */

  const now =
    Date.now();

  const elapsed =
    now -
    current.opened_at;

  if (
    elapsed >=
    RECOVERY_TIMEOUT
  ) {

    current.state =
      "HALF_OPEN";

    current.updated_at =
      Date.now();

    circuitStates.set(
      provider,
      current
    );

    return true;

  }

  return false;

}

/**
 * =====================================================
 * RESET CIRCUIT
 * =====================================================
 */

function resetCircuit(
  provider
) {

  const state =
    getDefaultState();

  circuitStates.set(
    provider,
    state
  );

  return state;

}

/**
 * =====================================================
 * GET ALL STATES
 * =====================================================
 */

function getAllCircuitStates() {

  return Object.fromEntries(
    circuitStates
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  markProviderSuccess,

  markProviderFailure,

  canProviderExecute,

  resetCircuit,

  getCircuitState,

  getAllCircuitStates,

};