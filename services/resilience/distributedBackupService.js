const runtimeSnapshots =
  [];

/**
 * =====================================================
 * CREATE SNAPSHOT
 * =====================================================
 */

function createRuntimeSnapshot({

  snapshot_type,

  payload,

}) {

  runtimeSnapshots.unshift({

    snapshot_type,

    payload,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET SNAPSHOTS
 * =====================================================
 */

function getRuntimeSnapshots() {

  return runtimeSnapshots;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  createRuntimeSnapshot,

  getRuntimeSnapshots,

};