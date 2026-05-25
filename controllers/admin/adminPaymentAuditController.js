/**
 * =====================================================
 * GET PAYMENT AUDIT LOGS
 * =====================================================
 */

async function getPaymentAuditLogs(
  req,
  res
) {

  try {

    return res.json({

      success: true,

      logs: [],

    });

  } catch (error) {

    console.error(
      "getPaymentAuditLogs error:",
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

  getPaymentAuditLogs,

};