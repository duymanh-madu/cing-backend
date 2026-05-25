const {

  assignDelivery,

} = require(
  "../../services/delivery/deliveryAssignmentService"
);

const {

  updateDeliveryTracking,

} = require(
  "../../services/delivery/liveDeliveryTrackingService"
);

const {

  processDeliveryFailure,

} = require(
  "../../services/delivery/deliveryRecoveryService"
);

const {

  updateCustomerDeliveryExperience,

} = require(
  "../../services/delivery/customerDeliveryExperienceService"
);

/**
 * =====================================================
 * DELIVERY EVENT ROUTER
 * =====================================================
 */

function routeDeliveryEvent({

  type,

  payload,

}) {

  switch (
    type
  ) {

    case "delivery_assigned":

      assignDelivery(
        payload
      );

      updateCustomerDeliveryExperience({

        user_id:
          payload.user_id,

        order_id:
          payload.order_id,

        message:
          "Shipper đã nhận đơn",

        eta_minutes: 20,

      });

      break;

    case "delivery_tracking_updated":

      updateDeliveryTracking(
        payload
      );

      updateCustomerDeliveryExperience({

        user_id:
          payload.user_id,

        order_id:
          payload.order_id,

        message:
          `Đơn hàng đang được giao - ETA ${payload.eta_minutes} phút`,

        eta_minutes:
          payload.eta_minutes,

      });

      break;

    case "delivery_failed":

      processDeliveryFailure(
        payload
      );

      updateCustomerDeliveryExperience({

        user_id:
          payload.user_id,

        order_id:
          payload.order_id,

        message:
          "Đơn giao gặp sự cố, đang xử lý lại",

        eta_minutes: null,

      });

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

  routeDeliveryEvent,

};