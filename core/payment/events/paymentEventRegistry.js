const registry = [];

function registerPaymentEvent({

  type,

  payload,

}) {

  registry.push({

    type,

    payload,

    created_at:
      new Date().toISOString(),

  });

}

function getPaymentEventRegistry() {

  return registry;

}

module.exports = {

  registerPaymentEvent,

  getPaymentEventRegistry,

};