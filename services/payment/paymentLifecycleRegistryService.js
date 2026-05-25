const lifecycleRegistry =
  [];

function registerPaymentLifecycleEvent(
  payload
) {

  lifecycleRegistry.push({

    ...payload,

    created_at:
      new Date().toISOString(),

  });

}

function getPaymentLifecycleEvents() {

  return lifecycleRegistry;

}

module.exports = {

  registerPaymentLifecycleEvent,

  getPaymentLifecycleEvents,

};