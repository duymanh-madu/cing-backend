const {

  getQueueTelemetry,

} = require(
  "./paymentQueueTelemetryService"
);

/**
 * =====================================================
 * CONFIG
 * =====================================================
 */

const MAX_RETRY_QUEUE =
  100;

const MAX_DEAD_QUEUE =
  50;

/**
 * =====================================================
 * CHECK PRESSURE
 * =====================================================
 */

async function detectPaymentPressure() {

  const telemetry =
    await getQueueTelemetry();

  const warnings =
    [];

  if (

    telemetry.retry_queue >

    MAX_RETRY_QUEUE

  ) {

    warnings.push({

      type:
        "retry_queue_pressure",

      queue:
        telemetry.retry_queue,

    });

  }

  if (

    telemetry.dead_letter_queue >

    MAX_DEAD_QUEUE

  ) {

    warnings.push({

      type:
        "dead_letter_pressure",

      queue:
        telemetry.dead_letter_queue,

    });

  }

  return {

    healthy:
      warnings.length === 0,

    warnings,

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

  detectPaymentPressure,

};