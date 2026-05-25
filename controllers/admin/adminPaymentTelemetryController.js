const {

  getAdminPaymentTelemetry,

} = require(
  "../../services/payment/paymentAdminTelemetryService"
);

/**
 * =====================================================
 * GET PAYMENT TELEMETRY
 * =====================================================
 */

async function getPaymentTelemetry(
  req,
  res
) {

  try {

    const telemetry =
      await getAdminPaymentTelemetry();

    return res.json({

      success: true,

      data:
        telemetry,

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

  getPaymentTelemetry,

};