let runtimeVersion =
  1;

const versionTimeline =
  [];

/**
 * =====================================================
 * INCREMENT VERSION
 * =====================================================
 */

function incrementRuntimeVersion({

  reason,

  actor,

}) {

  runtimeVersion += 1;

  versionTimeline.unshift({

    version:
      runtimeVersion,

    reason,

    actor,

    created_at:
      Date.now(),

  });

  return runtimeVersion;

}

/**
 * =====================================================
 * GET VERSION
 * =====================================================
 */

function getRuntimeVersion() {

  return runtimeVersion;

}

/**
 * =====================================================
 * GET VERSION TIMELINE
 * =====================================================
 */

function getRuntimeVersionTimeline() {

  return versionTimeline;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  incrementRuntimeVersion,

  getRuntimeVersion,

  getRuntimeVersionTimeline,

};