const retryQueue = [];

function enqueueRetryPayment(
  payload
) {

  retryQueue.push({

    id:
      `${Date.now()}`,

    retry_count:
      payload.retry_count || 0,

    transaction_code:
      payload.transaction_code,

    created_at:
      new Date().toISOString(),

  });

}

function getRetryQueue() {

  return retryQueue;

}

module.exports = {

  enqueueRetryPayment,

  getRetryQueue,

};