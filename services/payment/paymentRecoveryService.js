const {
  findTransactionByCode,
} = require(
  "./paymentTransactionService"
);

async function recoverPayment({

  transaction_code,

}) {

  const payment =

    await findTransactionByCode(
      transaction_code
    );

  if (!payment) {

    throw new Error(
      "Payment not found"
    );

  }

  return {

    transaction_code:
      payment.transaction_code,

    payment_status:
      payment.payment_status,

    payment_session_status:
      payment.payment_session_status,

    provider_transaction_id:
      payment.provider_transaction_id,

    amount:
      payment.amount,

  };

}

module.exports = {

  recoverPayment,

};