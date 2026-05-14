const {
  buildEvent,
} = require(
  "./baseEventContract"
);

function buildOrderCreatedEvent(
  payload
) {

  return buildEvent({

    event_name:
      "order.created",

    source:
      "order-domain",

    payload,

  });

}

function buildOrderPaidEvent(
  payload
) {

  return buildEvent({

    event_name:
      "order.paid",

    source:
      "payment-domain",

    payload,

  });

}

module.exports = {

  buildOrderCreatedEvent,

  buildOrderPaidEvent,

};