const {
  reconcilePayment,
} = require(
  "./paymentReconciliationService"
);

async function retryPayment({
  transaction_code,
}) {

  const result =

    await reconcilePayment({

      transaction_code,

    });

  return {

    success: true,

    retried: true,

    payment:
      result,

  };

}

module.exports = {

  retryPayment,

};