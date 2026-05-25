const paymentEventBus =
  require("./paymentEventBus");

const {
  registerPaymentEvent,
} = require(
  "./paymentEventRegistry"
);

async function publishPaymentEvent({

  type,

  payload,

}) {

  registerPaymentEvent({

    type,

    payload,

  });

  paymentEventBus.emit(
    type,
    payload
  );

}

module.exports = {

  publishPaymentEvent,

};