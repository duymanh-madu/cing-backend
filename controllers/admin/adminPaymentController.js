const {
  getProvidersHealth,
} = require(
  "../../services/payment/paymentProviderHealthService"
);

const {
  retryPayment,
} = require(
  "../../services/payment/paymentRetryService"
);

const {
  getPaymentAuditLogs,
} = require(
  "../../services/payment/paymentAuditService"
);

async function getPaymentProvidersHealth(
  req,
  res
) {

  try {

    const result =

      await getProvidersHealth();

    return res.json({

      success: true,

      data:
        result,

    });

  } catch (error) {

    return res.status(500).json({

      success: false,

      error:
        error.message,

    });

  }

}

async function retryFailedPayment(
  req,
  res
) {

  try {

    const {
      transaction_code,
    } = req.body;

    const result =
      await retryPayment({

        transaction_code,

      });

    return res.json({

      success: true,

      data:
        result,

    });

  } catch (error) {

    return res.status(500).json({

      success: false,

      error:
        error.message,

    });

  }

}

async function getAuditLogs(
  req,
  res
) {

  return res.json({

    success: true,

    data:
      getPaymentAuditLogs(),

  });

}

module.exports = {

  getPaymentProvidersHealth,

  retryFailedPayment,

  getAuditLogs,

};