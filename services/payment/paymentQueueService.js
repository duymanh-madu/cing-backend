const paymentQueue = [];

function enqueuePaymentJob(
  job
) {

  paymentQueue.push({

    id:
      `${Date.now()}`,

    ...job,

    queued_at:
      new Date().toISOString(),

  });

}

function dequeuePaymentJob() {

  return paymentQueue.shift();

}

function getPaymentQueue() {

  return paymentQueue;

}

module.exports = {

  enqueuePaymentJob,

  dequeuePaymentJob,

  getPaymentQueue,

};