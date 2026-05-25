const {

  setDistributedCache,

  invalidateDistributedCache,

} = require(
  "../../services/resilience/distributedCacheCoordinatorService"
);

const {

  openCircuit,

  closeCircuit,

} = require(
  "../../services/resilience/runtimeResilienceService"
);

const {

  createRuntimeSnapshot,

} = require(
  "../../services/resilience/distributedBackupService"
);

const {

  createConsistencyReport,

} = require(
  "../../services/resilience/runtimeConsistencyService"
);

/**
 * =====================================================
 * RESILIENCE EVENT ROUTER
 * =====================================================
 */

function routeResilienceEvent({

  type,

  payload,

}) {

  switch (
    type
  ) {

    case "cache_updated":

      setDistributedCache(
        payload
      );

      break;

    case "cache_invalidated":

      invalidateDistributedCache(
        payload.key
      );

      break;

    case "circuit_opened":

      openCircuit(
        payload
      );

      break;

    case "circuit_closed":

      closeCircuit(
        payload.service
      );

      break;

    case "snapshot_created":

      createRuntimeSnapshot(
        payload
      );

      break;

    case "consistency_report_created":

      createConsistencyReport(
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

  routeResilienceEvent,

};