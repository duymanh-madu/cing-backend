const {
  getPaymentQueue,
} = require(
  "../../services/payment/paymentQueueService"
);

const {
  getRetryQueue,
} = require(
  "../../services/payment/paymentRetryQueueService"
);

const {
  getRuntimeRegistry,
} = require(
  "../../services/payment/paymentRuntimeRegistryService"
);

async function getPaymentRuntime(
  req,
  res
) {

  return res.json({

    success: true,

    runtime:
      getRuntimeRegistry(),

    payment_queue:
      getPaymentQueue(),

    retry_queue:
      getRetryQueue(),

  });

}

module.exports = {

  getPaymentRuntime,

};