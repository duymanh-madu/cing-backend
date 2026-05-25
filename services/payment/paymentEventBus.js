const EventEmitter =
  require("events");

class PaymentEventBus extends EventEmitter {}

const paymentEventBus =
  new PaymentEventBus();

paymentEventBus.setMaxListeners(
  100
);

module.exports =
  paymentEventBus;