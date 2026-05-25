const featureFlags =
  new Map();

/**
 * =====================================================
 * ENABLE FEATURE
 * =====================================================
 */

function enableFeature(
  feature
) {

  featureFlags.set(
    feature,
    true
  );

}

/**
 * =====================================================
 * DISABLE FEATURE
 * =====================================================
 */

function disableFeature(
  feature
) {

  featureFlags.set(
    feature,
    false
  );

}

/**
 * =====================================================
 * CHECK FEATURE
 * =====================================================
 */

function isFeatureEnabled(
  feature
) {

  if (
    !featureFlags.has(
      feature
    )
  ) {

    return true;

  }

  return featureFlags.get(
    feature
  );

}

/**
 * =====================================================
 * GET FEATURES
 * =====================================================
 */

function getFeatureFlags() {

  return Object.fromEntries(
    featureFlags
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  enableFeature,

  disableFeature,

  isFeatureEnabled,

  getFeatureFlags,

};