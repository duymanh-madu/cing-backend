const {

  getDashboardSummary,

} = require(
  "./adminRealtimeService"
);

/**
 * ============================================
 * ADMIN SOCKET ROOMS
 * ============================================
 */

const ADMIN_ROOMS = {

  dashboard:
    "admin:dashboard",

  orders:
    "admin:orders",

  payments:
    "admin:payments",

  delivery:
    "admin:delivery",

  analytics:
    "admin:analytics",

  notifications:
    "admin:notifications",

};

/**
 * ============================================
 * SAFE EMIT
 * ============================================
 */

function safeEmit({

  room,

  event,

  payload,

}) {

  try {

    const io =
      global.io;

    if (!io) {

      return;

    }

    io.to(room).emit(
      event,
      payload
    );

  } catch (error) {

    console.error(

      "safeEmit error:",

      error.message

    );

  }

}

/**
 * ============================================
 * BUILD PAYLOAD
 * ============================================
 */

function buildPayload({

  type,

  data = {},

}) {

  return {

    success: true,

    type,

    timestamp:
      new Date(),

    data,

  };

}

/**
 * ============================================
 * BROADCAST DASHBOARD
 * ============================================
 */

async function broadcastDashboardUpdate() {

  try {

    const summary =
      await getDashboardSummary();

    safeEmit({

      room:
        ADMIN_ROOMS.dashboard,

      event:
        "dashboard_updated",

      payload:

        buildPayload({

          type:
            "dashboard_updated",

          data:
            summary,

        }),

    });

  } catch (error) {

    console.error(

      "broadcastDashboardUpdate error:",

      error.message

    );

  }

}

/**
 * ============================================
 * BROADCAST ORDER
 * ============================================
 */

async function broadcastOrderUpdate({

  order,

  action =
    "order_updated",

}) {

  try {

    safeEmit({

      room:
        ADMIN_ROOMS.orders,

      event:
        action,

      payload:

        buildPayload({

          type: action,

          data: {

            order,

          },

        }),

    });

    /**
     * DASHBOARD REFRESH
     */

    await broadcastDashboardUpdate();

  } catch (error) {

    console.error(

      "broadcastOrderUpdate error:",

      error.message

    );

  }

}

/**
 * ============================================
 * BROADCAST PAYMENT
 * ============================================
 */

async function broadcastPaymentUpdate({

  transaction,

  action =
    "payment_updated",

}) {

  try {

    safeEmit({

      room:
        ADMIN_ROOMS.payments,

      event:
        action,

      payload:

        buildPayload({

          type: action,

          data: {

            transaction,

          },

        }),

    });

    /**
     * DASHBOARD REFRESH
     */

    await broadcastDashboardUpdate();

  } catch (error) {

    console.error(

      "broadcastPaymentUpdate error:",

      error.message

    );

  }

}

/**
 * ============================================
 * BROADCAST DELIVERY
 * ============================================
 */

async function broadcastDeliveryUpdate({

  order,

  action =
    "delivery_updated",

}) {

  try {

    safeEmit({

      room:
        ADMIN_ROOMS.delivery,

      event:
        action,

      payload:

        buildPayload({

          type: action,

          data: {

            order,

          },

        }),

    });

  } catch (error) {

    console.error(

      "broadcastDeliveryUpdate error:",

      error.message

    );

  }

}

/**
 * ============================================
 * BROADCAST ANALYTICS
 * ============================================
 */

async function broadcastAnalyticsUpdate({

  analytics,

  action =
    "analytics_updated",

}) {

  try {

    safeEmit({

      room:
        ADMIN_ROOMS.analytics,

      event:
        action,

      payload:

        buildPayload({

          type: action,

          data: {

            analytics,

          },

        }),

    });

  } catch (error) {

    console.error(

      "broadcastAnalyticsUpdate error:",

      error.message

    );

  }

}

/**
 * ============================================
 * BROADCAST NOTIFICATION
 * ============================================
 */

async function broadcastNotificationUpdate({

  notification,

  action =
    "notification_updated",

}) {

  try {

    safeEmit({

      room:
        ADMIN_ROOMS.notifications,

      event:
        action,

      payload:

        buildPayload({

          type: action,

          data: {

            notification,

          },

        }),

    });

  } catch (error) {

    console.error(

      "broadcastNotificationUpdate error:",

      error.message

    );

  }

}

/**
 * ============================================
 * BROADCAST SYSTEM EVENT
 * ============================================
 */

async function broadcastSystemEvent({

  room,

  event,

  data = {},

}) {

  try {

    safeEmit({

      room,

      event,

      payload:

        buildPayload({

          type: event,

          data,

        }),

    });

  } catch (error) {

    console.error(

      "broadcastSystemEvent error:",

      error.message

    );

  }

}

/**
 * ============================================
 * EXPORTS
 * ============================================
 */

module.exports = {

  ADMIN_ROOMS,

  safeEmit,

  buildPayload,

  broadcastDashboardUpdate,

  broadcastOrderUpdate,

  broadcastPaymentUpdate,

  broadcastDeliveryUpdate,

  broadcastAnalyticsUpdate,

  broadcastNotificationUpdate,

  broadcastSystemEvent,

};