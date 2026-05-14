const {
  emitToAdmin,
} = require(
  "../socketEmitService"
);

async function broadcastDashboardRefresh() {

  emitToAdmin({

    room:
      "admin_dashboard",

    event:
      "dashboard_refresh",

    payload: {

      timestamp:
        new Date(),

    },

  });

}

module.exports = {

  broadcastDashboardRefresh,

};