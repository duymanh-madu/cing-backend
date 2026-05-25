const {
  getPaymentFailures,
} = require(
  "../../services/payment/paymentFailureRegistryService"
);

/**
 * =====================================================
 * GET PAYMENT FAILURES
 * =====================================================
 */

async function getPaymentFailuresController(
  req,
  res
) {

  try {

    const failures =
      getPaymentFailures();

    return res.json({

      success: true,

      failures,

    });

  } catch (error) {

    console.error(
      "getPaymentFailuresController error:",
      error.message
    );

    return res.status(500).json({

      success: false,

      message:
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

  getPaymentFailures:
    getPaymentFailuresController,

};