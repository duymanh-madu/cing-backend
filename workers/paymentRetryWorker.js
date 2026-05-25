const {
  dequeuePaymentJob,
} = require(
  "../services/payment/paymentQueueService"
);

const {
  enqueueRetryPayment,
} = require(
  "../services/payment/paymentRetryQueueService"
);

async function startPaymentRetryWorker() {

  setInterval(
    async () => {

      const job =
        dequeuePaymentJob();

      if (!job) {

        return;

      }

      try {

        console.log(
          "[PAYMENT WORKER] Processing:",
          job.transaction_code
        );

      } catch (error) {

        enqueueRetryPayment({

          transaction_code:
            job.transaction_code,

        });

      }

    },
    5000
  );

}

module.exports = {

  startPaymentRetryWorker,

};