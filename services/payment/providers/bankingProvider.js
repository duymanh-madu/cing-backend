function createPayment({

  transactionCode,

  amount,

}) {

  return {

    provider:
      "banking",

    providerTransactionId:
      transactionCode,

    paymentUrl:
      null,

    qrContent:
      `CINGHU-${transactionCode}`,

    amount,

  };

}

module.exports = {

  createPayment,

};