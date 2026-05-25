const {

  getQueueTelemetry,

} = require(
  "../../services/payment/paymentQueueTelemetryService"
);

const {

  detectPaymentPressure,

} = require(
  "../../services/payment/paymentPressureMonitoringService"
);

/**
 * =====================================================
 * GET PAYMENT QUEUES
 * =====================================================
 */

async function getPaymentQueues(
  req,
  res
) {

  try {

    const queues =
      await getQueueTelemetry();

    return res.json({

      success: true,

      data:
        queues,

    });

  } catch (error) {

    return res.status(500).json({

      success: false,

      error:
        error.message,

    });

  }

}

/**
 * =====================================================
 * GET PAYMENT PRESSURE
 * =====================================================
 */

async function getPaymentPressure(
  req,
  res
) {

  try {

    const pressure =
      await detectPaymentPressure();

    return res.json({

      success: true,

      data:
        pressure,

    });

  } catch (error) {

    return res.status(500).json({

      success: false,

      error:
        error.message,

    });

  }

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  getPaymentQueues,

  getPaymentPressure,

};