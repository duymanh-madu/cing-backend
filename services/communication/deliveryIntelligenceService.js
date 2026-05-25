const deliveryEvents =
  [];

/**
 * =====================================================
 * TRACK DELIVERY EVENT
 * =====================================================
 */

function trackDeliveryEvent({

  notification_id,

  user_id,

  event_type,

}) {

  deliveryEvents.unshift({

    notification_id,

    user_id,

    event_type,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET DELIVERY EVENTS
 * =====================================================
 */

function getDeliveryEvents() {

  return deliveryEvents;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  trackDeliveryEvent,

  getDeliveryEvents,

};