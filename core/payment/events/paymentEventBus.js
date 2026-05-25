const EventEmitter =
  require("events");

class PaymentEventBus extends EventEmitter {}

const paymentEventBus =
  new PaymentEventBus();

module.exports =
  paymentEventBus;