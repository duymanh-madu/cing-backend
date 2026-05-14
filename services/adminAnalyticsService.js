const supabase =
  require("../supabase");

/**
 * =========================================
 * TOTAL ORDERS
 * =========================================
 */

async function getTotalOrders() {

  const {
    count,
    error,
  } = await supabase

    .from("orders")

    .select("*", {

      count: "exact",

      head: true,

    });

  if (error) {

    throw new Error(
      error.message
    );

  }

  return count || 0;

}

/**
 * =========================================
 * TOTAL REVENUE
 * =========================================
 */

async function getTotalRevenue() {

  const {
    data,
    error,
  } = await supabase

    .from("orders")

    .select("total_amount")

    .eq(
      "payment_status",
      "paid"
    );

  if (error) {

    throw new Error(
      error.message
    );

  }

  const total =
    (
      data || []
    ).reduce(

      (
        sum,
        item
      ) => {

        return (
          sum +
          Number(
            item.total_amount || 0
          )
        );

      },

      0
    );

  return total;

}

/**
 * =========================================
 * TOTAL PLAYERS
 * =========================================
 */

async function getTotalPlayers() {

  const {
    count,
    error,
  } = await supabase

    .from("players")

    .select("*", {

      count: "exact",

      head: true,

    });

  if (error) {

    throw new Error(
      error.message
    );

  }

  return count || 0;

}

/**
 * =========================================
 * TOTAL NOTIFICATIONS
 * =========================================
 */

async function getTotalNotifications() {

  const {
    count,
    error,
  } = await supabase

    .from("notifications")

    .select("*", {

      count: "exact",

      head: true,

    });

  if (error) {

    throw new Error(
      error.message
    );

  }

  return count || 0;

}

/**
 * =========================================
 * TOP PLAYERS
 * =========================================
 */

async function getTopPlayers() {

  const {
    data,
    error,
  } = await supabase

    .from("players")

    .select("*")

    .order(
      "total_points",

      {
        ascending: false,
      }
    )

    .limit(10);

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data || [];

}

/**
 * =========================================
 * DASHBOARD SUMMARY
 * =========================================
 */

async function getDashboardSummary() {

  const [

    totalOrders,

    totalRevenue,

    totalPlayers,

    totalNotifications,

    topPlayers,

  ] = await Promise.all([

    getTotalOrders(),

    getTotalRevenue(),

    getTotalPlayers(),

    getTotalNotifications(),

    getTopPlayers(),

  ]);

  return {

    totalOrders,

    totalRevenue,

    totalPlayers,

    totalNotifications,

    topPlayers,

  };

}

/**
 * =========================================
 * EXPORTS
 * =========================================
 */

module.exports = {

  getDashboardSummary,

};