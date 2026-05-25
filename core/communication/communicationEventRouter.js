const {

  createSmartNotification,

} = require(
  "../../services/communication/smartNotificationEngineService"
);

const {

  pushInAppMessage,

} = require(
  "../../services/communication/inAppMessagingService"
);

const {

  trackDeliveryEvent,

} = require(
  "../../services/communication/deliveryIntelligenceService"
);

/**
 * =====================================================
 * COMMUNICATION EVENT ROUTER
 * =====================================================
 */

function routeCommunicationEvent({

  type,

  payload,

}) {

  switch (
    type
  ) {

    case "send_notification":

      createSmartNotification({

        user_id:
          payload.user_id,

        type:
          payload.notification_type,

        title:
          payload.title,

        message:
          payload.message,

        metadata:
          payload.metadata,

      });

      break;

    case "push_inapp_message":

      pushInAppMessage({

        user_id:
          payload.user_id,

        message_type:
          payload.message_type,

        title:
          payload.title,

        content:
          payload.content,

      });

      break;

    case "delivery_event":

      trackDeliveryEvent(
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

  routeCommunicationEvent,

};