const paymentEventBus =
  require("./paymentEventBus");

const PAYMENT_EVENT_TYPES =
  require(
    "./paymentEventTypes"
  );

const paymentPaidListener =
  require(
    "./listeners/paymentPaidListener"
  );

function registerPaymentEvents() {

  paymentEventBus.on(

    PAYMENT_EVENT_TYPES.PAYMENT_PAID,

    paymentPaidListener
  );

  console.log(
    "[PAYMENT] Event listeners registered"
  );

}

module.exports = {

  registerPaymentEvents,

};