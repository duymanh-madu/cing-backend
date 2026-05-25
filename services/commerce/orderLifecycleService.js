const orders =
  new Map();

/**
 * =====================================================
 * CREATE ORDER
 * =====================================================
 */

function createOrderLifecycle({

  order_id,

  user_id,

  status = "created",

  metadata = {},

}) {

  const order = {

    order_id,

    user_id,

    status,

    metadata,

    timeline: [

      {

        status,

        created_at:
          Date.now(),

      },

    ],

    created_at:
      Date.now(),

  };

  orders.set(
    order_id,
    order
  );

  return order;

}

/**
 * =====================================================
 * UPDATE ORDER STATUS
 * =====================================================
 */

function updateOrderLifecycle({

  order_id,

  status,

}) {

  const order =
    orders.get(
      order_id
    );

  if (!order) {

    throw new Error(
      "Order not found"
    );

  }

  order.status =
    status;

  order.timeline.push({

    status,

    created_at:
      Date.now(),

  });

  order.updated_at =
    Date.now();

  return order;

}

/**
 * =====================================================
 * GET ORDER
 * =====================================================
 */

function getOrderLifecycle(
  order_id
) {

  return (
    orders.get(
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

  createOrderLifecycle,

  updateOrderLifecycle,

  getOrderLifecycle,

};