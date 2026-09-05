const {
  findOwnedPaymentByCode,
} = require(
  "./paymentCustomerOwnershipService"
);


async function recoverPayment({
  transaction_code,
  customer,
}) {
  const payment =
    await findOwnedPaymentByCode({
      transactionCode:
        transaction_code,

      customer,
    });

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
