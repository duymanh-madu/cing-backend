const {
  getPaymentEventRegistry,
} = require(
  "../../services/payment/paymentEventRegistry"
);

async function getPaymentEvents(
  req,
  res
) {

  return res.json({

    success: true,

    events:
      getPaymentEventRegistry(),

  });

}

module.exports = {

  getPaymentEvents,

};