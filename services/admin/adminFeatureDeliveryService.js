const featureDeliveries =
  [];

/**
 * =====================================================
 * REGISTER FEATURE DELIVERY
 * =====================================================
 */

function registerFeatureDelivery({

  feature,

  target_type,

  target_value,

  enabled,

}) {

  featureDeliveries.push({

    feature,

    target_type,

    target_value,

    enabled,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET FEATURE DELIVERIES
 * =====================================================
 */

function getFeatureDeliveries() {

  return featureDeliveries;

}

/**
 * =====================================================
 * CHECK FEATURE DELIVERY
 * =====================================================
 */

function canAccessFeature({

  feature,

  target_type,

  target_value,

}) {

  const matched =
    featureDeliveries.find(

      (
        item
      ) =>

        item.feature ===
          feature &&

        item.target_type ===
          target_type &&

        item.target_value ===
          target_value

    );

  if (!matched) {

    return true;

  }

  return matched.enabled;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  registerFeatureDelivery,

  getFeatureDeliveries,

  canAccessFeature,

};