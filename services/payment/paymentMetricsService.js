const metrics = {

  totalPayments: 0,

  totalPaid: 0,

  totalFailed: 0,

  totalExpired: 0,

  totalPending: 0,

};

function incrementMetric(
  metric
) {

  if (
    typeof metrics[
      metric
    ] !== "number"
  ) {

    return;

  }

  metrics[metric] += 1;

}

function decrementMetric(
  metric
) {

  if (
    typeof metrics[
      metric
    ] !== "number"
  ) {

    return;

  }

  metrics[metric] -= 1;

}

function getPaymentMetrics() {

  return metrics;

}

module.exports = {

  incrementMetric,

  decrementMetric,

  getPaymentMetrics,

};