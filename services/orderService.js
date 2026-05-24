const {
  createOrderRecord,
} = require(
  "../repositories/orderRepository"
);

const {
  ORDER_STATUS,
} = require(
  "./orderStatusService"
);

const eventBus =
  require(
    "../core/events/eventBus"
  );

/**
 * ============================================
 * GENERATE ORDER CODE
 * ============================================
 */

function generateOrderCode() {

  return `ORD-${Date.now()}`;

}

/**
 * ============================================
 * CREATE ORDER
 * ============================================
 */

async function createOrder(payload) {

  /**
   * ============================================
   * EXTRACT
   * ============================================
   */

  const {

    items = [],

    status_code =
      "pending_payment",

  } = payload;

  /**
   * ============================================
   * VALIDATE
   * ============================================
   */

  if (

    !Array.isArray(items) ||

    items.length === 0

  ) {

    throw new Error(
      "Giỏ hàng trống"
    );

  }

  /**
   * ============================================
   * STATUS TEXT
   * ============================================
   */

  const status_text =

    ORDER_STATUS[
      status_code
    ] ||

    "Chờ thanh toán";

  /**
   * ============================================
   * CREATE ORDER
   * ============================================
   */

  const order = await createOrderRecord({

      ...payload,

      status:
        status_code,

      status_code,

      status_text,

      order_code:
        generateOrderCode(),


      created_at:
        new Date(),

      updated_at:
        new Date(),

    });

  

  /**
   * ============================================
   * SINGLE DOMAIN EVENT
   * ============================================
   */

  eventBus.emitEvent(

    "order.created",

    {

      order,

      payload,

    }

  );

  /**
   * ============================================
   * RETURN
   * ============================================
   */

  return {

    success: true,

    order,

  };

}

module.exports = {

  createOrder,

};