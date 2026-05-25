const failures = [];

function registerPaymentFailure(
  payload
) {

  failures.unshift({

    ...payload,

    created_at:
      new Date().toISOString(),

  });

}

function getPaymentFailures() {

  return failures;

}

module.exports = {

  registerPaymentFailure,

  getPaymentFailures,

};