const {

  createOrderLifecycle,

  updateOrderLifecycle,

} = require(
  "../../services/commerce/orderLifecycleService"
);

const {

  canTransition,

} = require(
  "../../services/commerce/orderStateMachineService"
);

const {

  pushCommerceQueueJob,

} = require(
  "../../services/commerce/commerceQueueOrchestratorService"
);

const {

  updateCustomerRealtimeOrder,

} = require(
  "../../services/commerce/customerOrderRealtimeService"
);

/**
 * =====================================================
 * COMMERCE EVENT ROUTER
 * =====================================================
 */

function routeCommerceEvent({

  type,

  payload,

}) {

  switch (
    type
  ) {

    case "order_created":

      createOrderLifecycle(
        payload
      );

      updateCustomerRealtimeOrder({

        user_id:
          payload.user_id,

        order_id:
          payload.order_id,

        status:
          "created",

        message:
          "Đơn hàng đã được tạo",

      });

      break;

    case "order_status_updated":

      if (

        canTransition({

          current_status:
            payload.current_status,

          next_status:
            payload.next_status,

        })

      ) {

        updateOrderLifecycle({

          order_id:
            payload.order_id,

          status:
            payload.next_status,

        });

        updateCustomerRealtimeOrder({

          user_id:
            payload.user_id,

          order_id:
            payload.order_id,

          status:
            payload.next_status,

          message:
            `Đơn hàng đang ${payload.next_status}`,

        });

      }

      break;

    case "commerce_queue_job":

      pushCommerceQueueJob(
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

  routeCommerceEvent,

};