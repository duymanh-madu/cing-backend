const {

  getQueueSize,

} = require(
  "./paymentDistributedQueueService"
);

/**
 * =====================================================
 * GET QUEUE TELEMETRY
 * =====================================================
 */

async function getQueueTelemetry() {

  const retryQueue =
    await getQueueSize(
      "payment-retry"
    );

  const recoveryQueue =
    await getQueueSize(
      "payment-recovery"
    );

  const deadQueue =
    await getQueueSize(
      "payment-dead-letter"
    );

  return {

    retry_queue:
      retryQueue,

    recovery_queue:
      recoveryQueue,

    dead_letter_queue:
      deadQueue,

    checked_at:
      Date.now(),

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  getQueueTelemetry,

};