const liveDeliveryTracking =
  new Map();

/**
 * =====================================================
 * UPDATE DELIVERY TRACKING
 * =====================================================
 */

function updateDeliveryTracking({

  order_id,

  shipper_location,

  eta_minutes,

  delivery_status,

}) {

  liveDeliveryTracking.set(

    order_id,

    {

      shipper_location,

      eta_minutes,

      delivery_status,

      updated_at:
        Date.now(),

    }

  );

}

/**
 * =====================================================
 * GET DELIVERY TRACKING
 * =====================================================
 */

function getDeliveryTracking(
  order_id
) {

  return (
    liveDeliveryTracking.get(
      order_id
    ) || null
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  updateDeliveryTracking,

  getDeliveryTracking,

};