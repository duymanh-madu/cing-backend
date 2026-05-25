const {

  incrementMetric,

  setMetric,

} = require(
  "../../services/observability/systemMetricsService"
);

const {

  updateRuntimeHealth,

} = require(
  "../../services/observability/runtimeHealthService"
);

const {

  createAuditLog,

} = require(
  "../../services/observability/distributedAuditService"
);

const {

  setFeatureToggle,

} = require(
  "../../services/observability/systemGovernanceService"
);

/**
 * =====================================================
 * OBSERVABILITY EVENT ROUTER
 * =====================================================
 */

function routeObservabilityEvent({

  type,

  payload,

}) {

  switch (
    type
  ) {

    case "metric_increment":

      incrementMetric(

        payload.key,

        payload.value

      );

      break;

    case "metric_set":

      setMetric(

        payload.key,

        payload.value

      );

      break;

    case "runtime_health_updated":

      updateRuntimeHealth(
        payload
      );

      break;

    case "audit_log_created":

      createAuditLog(
        payload
      );

      break;

    case "feature_toggle_updated":

      setFeatureToggle(
        payload
      );

      break;

    default:

      break;

  }

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  routeObservabilityEvent,

};