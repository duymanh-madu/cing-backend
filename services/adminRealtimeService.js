const supabase =
  require("../supabase");

/**
 * ============================================
 * GET DASHBOARD SUMMARY
 * ============================================
 */

async function getDashboardSummary() {

  /**
   * ============================================
   * TODAY RANGE
   * ============================================
   */

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  /**
   * ============================================
   * ORDERS
   * ============================================
   */

  const {

    data: orders,

    error: ordersError,

  } = await supabase

    .from("orders")

    .select(`
      id,
      total_amount,
      status_code,
      payment_status,
      created_at
    `)

    .gte(
      "created_at",
      today.toISOString()
    );

  if (ordersError) {

    throw new Error(
      ordersError.message
    );

  }

  /**
   * ============================================
   * PAYMENTS
   * ============================================
   */

  const {

    data: payments,

    error: paymentsError,

  } = await supabase

    .from(
      "payment_transactions"
    )

    .select(`
      id,
      amount,
      payment_status,
      created_at
    `)

    .gte(
      "created_at",
      today.toISOString()
    );

  if (paymentsError) {

    throw new Error(
      paymentsError.message
    );

  }

  /**
   * ============================================
   * USERS
   * ============================================
   */

  const realtime_users =

    global.onlineUsers
      ?.size || 0;

  /**
   * ============================================
   * CALCULATE
   * ============================================
   */

  const total_orders =
    orders.length;

  const completed_orders =

    orders.filter(

      (item) =>

        item.status_code ===
        "completed"

    ).length;

  const pending_orders =

    orders.filter(

      (item) =>

        [
          "pending_payment",
          "paid",
          "confirmed",
          "preparing",
          "ready",
          "delivering",
        ].includes(
          item.status_code
        )

    ).length;

  const cancelled_orders =

    orders.filter(

      (item) =>

        item.status_code ===
        "cancelled"

    ).length;

  const total_revenue =

    orders.reduce(

      (sum, item) => {

        return (

          sum +

          Number(
            item.total_amount || 0
          )

        );

      },

      0

    );

  const paid_payments =

    payments.filter(

      (item) =>

        item.payment_status ===
        "paid"

    ).length;

  const failed_payments =

    payments.filter(

      (item) =>

        item.payment_status ===
        "failed"

    ).length;

  /**
   * ============================================
   * RETURN
   * ============================================
   */

  return {

    success: true,

    summary: {

      realtime_users,

      total_orders,

      completed_orders,

      pending_orders,

      cancelled_orders,

      total_revenue,

      paid_payments,

      failed_payments,

    },

  };

}

/**
 * ============================================
 * GET ACTIVE ORDERS
 * ============================================
 */

async function getActiveOrders({

  limit = 50,

}) {

  const activeStatuses = [

    "pending_payment",

    "paid",

    "confirmed",

    "preparing",

    "ready",

    "delivering",

  ];

  const {

    data,

    error,

  } = await supabase

    .from("orders")

    .select("*")

    .in(
      "status_code",
      activeStatuses
    )

    .order(
      "created_at",
      {
        ascending: false,
      }
    )

    .limit(limit);

  if (error) {

    throw new Error(
      error.message
    );

  }

  return {

    success: true,

    orders: data || [],

  };

}

/**
 * ============================================
 * GET RECENT PAYMENTS
 * ============================================
 */

async function getRecentPayments({

  limit = 30,

}) {

  const {

    data,

    error,

  } = await supabase

    .from(
      "payment_transactions"
    )

    .select("*")

    .order(
      "created_at",
      {
        ascending: false,
      }
    )

    .limit(limit);

  if (error) {

    throw new Error(
      error.message
    );

  }

  return {

    success: true,

    payments:
      data || [],

  };

}

/**
 * ============================================
 * GET DELIVERY QUEUE
 * ============================================
 */

async function getDeliveryQueue({

  limit = 50,

}) {

  const {

    data,

    error,

  } = await supabase

    .from("orders")

    .select("*")

    .in(
      "status_code",
      [
        "ready",
        "delivering",
      ]
    )

    .order(
      "updated_at",
      {
        ascending: false,
      }
    )

    .limit(limit);

  if (error) {

    throw new Error(
      error.message
    );

  }

  return {

    success: true,

    queue:
      data || [],

  };

}

/**
 * ============================================
 * GET REALTIME ANALYTICS
 * ============================================
 */

async function getRealtimeAnalytics() {

  const {

    data,

    error,

  } = await supabase

    .from(
      "analytics_events"
    )

    .select("*")

    .order(
      "created_at",
      {
        ascending: false,
      }
    )

    .limit(100);

  if (error) {

    throw new Error(
      error.message
    );

  }

  /**
   * GROUP EVENTS
   */

  const grouped = {};

  for (
    const item of data || []
  ) {

    const key =

      item.event_type ||

      item.event_name ||

      "unknown";

    if (!grouped[key]) {

      grouped[key] = 0;

    }

    grouped[key]++;

  }

  return {

    success: true,

    analytics: grouped,

    events:
      data || [],

  };

}

/**
 * ============================================
 * BROADCAST ADMIN EVENT
 * ============================================
 */

async function broadcastAdminEvent({

  room = "admin:dashboard",

  event = "dashboard_update",

  payload = {},

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

      "broadcast admin event error:",

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

  getDashboardSummary,

  getActiveOrders,

  getRecentPayments,

  getDeliveryQueue,

  getRealtimeAnalytics,

  broadcastAdminEvent,

};