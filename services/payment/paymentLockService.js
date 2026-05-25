const activeLocks =
  new Map();

function acquirePaymentLock(
  transactionCode
) {

  if (
    activeLocks.has(
      transactionCode
    )
  ) {

    return false;

  }

  activeLocks.set(
    transactionCode,
    true
  );

  return true;

}

function releasePaymentLock(
  transactionCode
) {

  activeLocks.delete(
    transactionCode
  );

}

module.exports = {

  acquirePaymentLock,

  releasePaymentLock,

};