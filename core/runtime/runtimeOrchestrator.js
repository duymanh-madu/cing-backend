const {

  broadcastGlobalRuntime,

} = require(
  "../../services/runtime/runtimeBroadcastService"
);

const {

  incrementRuntimeVersion,

} = require(
  "../../services/runtime/runtimeVersionService"
);

const {

  getRuntimeSnapshot,

} = require(
  "../../services/runtime/runtimeSnapshotService"
);

/**
 * =====================================================
 * APPLY RUNTIME UPDATE
 * =====================================================
 */

function applyRuntimeUpdate({

  type,

  payload,

  actor,

}) {

  const version =
    incrementRuntimeVersion({

      reason: type,

      actor,

    });

  const snapshot =
    getRuntimeSnapshot();

  broadcastGlobalRuntime({

    type,

    payload: {

      version,

      snapshot,

      changes:
        payload,

    },

  });

  return {

    success: true,

    version,

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  applyRuntimeUpdate,

};