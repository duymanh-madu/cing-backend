const providerHealthRegistry =
  new Map();

/**
 * =========================================
 * DEFAULT HEALTH
 * =========================================
 */

function createDefaultHealth(
  provider
) {

  return {

    provider,

    status: "healthy",

    last_success_at: null,

    last_failure_at: null,

    latency_ms: 0,

    success_count: 0,

    failure_count: 0,

    consecutive_failures: 0,

    degraded_mode: false,

    maintenance_mode: false,

    last_error: null,

    updated_at:
      new Date().toISOString(),

  };

}

/**
 * =========================================
 * ENSURE PROVIDER
 * =========================================
 */

function ensureProvider(
  provider
) {

  if (
    !providerHealthRegistry.has(
      provider
    )
  ) {

    providerHealthRegistry.set(
      provider,
      createDefaultHealth(
        provider
      )
    );

  }

  return providerHealthRegistry.get(
    provider
  );

}

/**
 * =========================================
 * MARK SUCCESS
 * =========================================
 */

function markProviderSuccess({

  provider,

  latency_ms = 0,

}) {

  const current =
    ensureProvider(provider);

  const updated = {

    ...current,

    status: "healthy",

    latency_ms,

    degraded_mode: false,

    last_success_at:
      new Date().toISOString(),

    success_count:
      current.success_count + 1,

    consecutive_failures: 0,

    updated_at:
      new Date().toISOString(),

  };

  providerHealthRegistry.set(
    provider,
    updated
  );

  return updated;

}

/**
 * =========================================
 * MARK FAILURE
 * =========================================
 */

function markProviderFailure({

  provider,

  error,

}) {

  const current =
    ensureProvider(provider);

  const consecutiveFailures =
    current.consecutive_failures +
    1;

  const degraded =
    consecutiveFailures >= 3;

  const status =
    consecutiveFailures >= 5
      ? "offline"
      : degraded
      ? "degraded"
      : "healthy";

  const updated = {

    ...current,

    status,

    degraded_mode:
      degraded,

    failure_count:
      current.failure_count + 1,

    consecutive_failures:
      consecutiveFailures,

    last_failure_at:
      new Date().toISOString(),

    last_error:
      error || null,

    updated_at:
      new Date().toISOString(),

  };

  providerHealthRegistry.set(
    provider,
    updated
  );

  return updated;

}

/**
 * =========================================
 * MAINTENANCE MODE
 * =========================================
 */

function setMaintenanceMode({

  provider,

  enabled,

}) {

  const current =
    ensureProvider(provider);

  const updated = {

    ...current,

    maintenance_mode:
      enabled,

    status: enabled
      ? "maintenance"
      : "healthy",

    updated_at:
      new Date().toISOString(),

  };

  providerHealthRegistry.set(
    provider,
    updated
  );

  return updated;

}

/**
 * =========================================
 * GET HEALTH
 * =========================================
 */

function getProviderHealth(
  provider
) {

  return ensureProvider(
    provider
  );

}

/**
 * =========================================
 * GET ALL HEALTH
 * =========================================
 */

function getAllProviderHealth() {

  return Array.from(
    providerHealthRegistry.values()
  );

}

/**
 * =========================================
 * RESET PROVIDER
 * =========================================
 */

function resetProviderHealth(
  provider
) {

  const reset =
    createDefaultHealth(
      provider
    );

  providerHealthRegistry.set(
    provider,
    reset
  );

  return reset;

}

/**
 * =========================================
 * EXPORTS
 * =========================================
 */

module.exports = {

  markProviderSuccess,

  markProviderFailure,

  setMaintenanceMode,

  getProviderHealth,

  getAllProviderHealth,

  resetProviderHealth,

};