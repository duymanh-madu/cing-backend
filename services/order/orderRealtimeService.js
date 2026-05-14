const {

  emitToAdmin,

  emitToUser,

} = require(
  "../socketEmitService"
);

async function emitOrderCreated({

  order,

}) {

  emitToAdmin({

    room:
      "admin_orders",

    event:
      "order_created",

    payload:
      order,

  });

  if (
    order.user_id
  ) {

    emitToUser({

      user_id:
        order.user_id,

      event:
        "order_created",

      payload:
        order,

    });

  }

}

module.exports = {

  emitOrderCreated,

};