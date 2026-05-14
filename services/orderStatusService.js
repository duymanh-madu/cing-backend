const supabase =
  require("../supabase");

const {
  createNotification,
} = require(
  "./notificationService"
);

const {
  trackEvent,
} = require(
  "./adminAnalyticsService"
);

const {

  broadcastOrderUpdate,

  broadcastDeliveryUpdate,

  broadcastDashboardUpdate,

} = require(
  "./adminRealtimeBroadcastService"
);

/**
 * ============================================
 * STATUS CONFIG
 * ============================================
 */

const ORDER_STATUS = {

  pending_payment:
    "Chờ thanh toán",

  paid:
    "Đã thanh toán",

  confirmed:
    "Đã xác nhận",

  preparing:
    "Đang pha chế",

  ready:
    "Sẵn sàng",

  delivering:
    "Đang giao hàng",

  completed:
    "Hoàn thành",

  cancelled:
    "Đã huỷ",

  refunded:
    "Đã hoàn tiền",

  failed:
    "Thất bại",

};

const CUSTOMER_VISIBLE_STATUS = [

  "paid",

  "confirmed",

  "preparing",

  "ready",

  "delivering",

  "completed",

  "cancelled",

  "refunded",

];

const NOTIFICATION_STATUS = [

  "confirmed",

  "ready",

  "delivering",

  "completed",

  "cancelled",

];

const DELIVERY_STATUS = [

  "ready",

  "delivering",

  "completed",

];

const VALID_TRANSITIONS = {

  pending_payment: [
    "paid",
    "cancelled",
    "failed",
  ],

  paid: [
    "confirmed",
    "cancelled",
    "refunded",
  ],

  confirmed: [
    "preparing",
    "cancelled",
  ],

  preparing: [
    "ready",
    "cancelled",
  ],

  ready: [
    "delivering",
    "completed",
  ],

  delivering: [
    "completed",
    "cancelled",
  ],

  completed: [],

  cancelled: [],

  refunded: [],

  failed: [],

};

/**
 * ============================================
 * UPDATE ORDER STATUS
 * ============================================
 */

async function updateOrderStatus({

  order_id,

  status_code,

  updated_by = "system",

  note = null,

  metadata = {},

  send_notification = true,

}) {

  const {

    data: order,

    error,

  } = await supabase

    .from("orders")

    .select("*")

    .eq(
      "id",
      order_id
    )

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  if (!order) {

    throw new Error(
      "Order not found"
    );

  }

  /**
   * VALID STATUS
   */

  if (

    !ORDER_STATUS[
      status_code
    ]

  ) {

    throw new Error(
      "Invalid order status"
    );

  }

  /**
   * IDEMPOTENCY
   */

  const current_status =

    order.status_code ||
    "pending_payment";

  if (
    current_status ===
    status_code
  ) {

    return {

      success: true,

      duplicated: true,

      order,

    };

  }

  /**
   * VALID TRANSITION
   */

  const allowedTransitions =

    VALID_TRANSITIONS[
      current_status
    ] || [];

  if (

    !allowedTransitions.includes(
      status_code
    )

  ) {

    throw new Error(

      `Invalid status transition: ${current_status} -> ${status_code}`

    );

  }

  /**
   * CONCURRENT LOCK
   */

  const {

    data: lockedOrder,

  } = await supabase

    .from("orders")

    .update({

      updated_at:
        new Date(),

    })

    .eq(
      "id",
      order_id
    )

    .eq(
      "status_code",
      current_status
    )

    .select("*")

    .maybeSingle();

  if (!lockedOrder) {

    return {

      success: false,

      concurrent_update:
        true,

    };

  }

  /**
   * HISTORY
   */

  const status_history =

    Array.isArray(
      order.status_history
    )

      ? order.status_history

      : [];

  status_history.push({

    status_code,

    status_text:

      ORDER_STATUS[
        status_code
      ],

    updated_by,

    note,

    metadata,

    created_at:
      new Date(),

  });

  /**
   * UPDATE PAYLOAD
   */

  const updatePayload = {

    status_code,

    status_text:

      ORDER_STATUS[
        status_code
      ],

    status:
      status_code,

    status_history,

    last_status_updated_at:
      new Date(),

    updated_at:
      new Date(),

  };

  /**
   * TIMESTAMPS
   */

  switch (status_code) {

    case "confirmed":

      updatePayload.confirmed_at =
        new Date();

      break;

    case "preparing":

      updatePayload.preparing_at =
        new Date();

      break;

    case "ready":

      updatePayload.ready_at =
        new Date();

      break;

    case "delivering":

      updatePayload.delivering_at =
        new Date();

      break;

    case "completed":

      updatePayload.completed_at =
        new Date();

      break;

    case "cancelled":

      updatePayload.cancelled_at =
        new Date();

      break;

    case "refunded":

      updatePayload.refunded_at =
        new Date();

      break;

  }

  /**
   * UPDATE ORDER
   */

  const {

    data: updatedOrder,

    error: updateError,

  } = await supabase

    .from("orders")

    .update(updatePayload)

    .eq(
      "id",
      order_id
    )

    .select("*")

    .maybeSingle();

  if (updateError) {

    throw new Error(
      updateError.message
    );

  }

  /**
   * REALTIME ORDER
   */

  await broadcastOrderUpdate({

    order:
      updatedOrder,

    action:
      "order_status_updated",

  });

  /**
   * DELIVERY ROOM
   */

  if (

    DELIVERY_STATUS.includes(
      status_code
    )

  ) {

    await broadcastDeliveryUpdate({

      order:
        updatedOrder,

      action:
        "delivery_status_updated",

    });

  }

  /**
   * NOTIFICATION
   */

  try {

    if (

      send_notification &&

      updatedOrder.user_id &&

      NOTIFICATION_STATUS.includes(
        status_code
      )

    ) {

      await createNotification({

        user_id:
          updatedOrder.user_id,

        notification_type:
          "order_status",

        type:
          "order_status",

        title:
          "Cập nhật đơn hàng",

        message:

          `Đơn ${updatedOrder.order_code} - ${ORDER_STATUS[status_code]}`,

        action_url:
          "/orders",

      });

    }

  } catch (notificationError) {

    console.error(

      "notification error:",

      notificationError.message

    );

  }

  /**
   * ANALYTICS
   */

  try {

    await trackEvent({

      event_type:
        "order_status_updated",

      user_id:
        updatedOrder.user_id,

      event_data: {

        order_id:
          updatedOrder.id,

        order_code:
          updatedOrder.order_code,

        status_code,

        updated_by,

      },

    });

  } catch (analyticsError) {

    console.error(

      "analytics error:",

      analyticsError.message

    );

  }

  /**
   * DASHBOARD REFRESH
   */

  await broadcastDashboardUpdate();

  /**
   * RETURN
   */

  return {

    success: true,

    order:
      updatedOrder,

  };

}

module.exports = {

  ORDER_STATUS,

  VALID_TRANSITIONS,

  CUSTOMER_VISIBLE_STATUS,

  updateOrderStatus,

};