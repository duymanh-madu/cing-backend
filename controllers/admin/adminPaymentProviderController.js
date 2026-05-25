const {

  getPaymentRuntimeConfig,

  updatePaymentRuntimeConfig,

} = require(
  "../../services/payment/paymentRuntimeConfigService"
);

const {

  getAllCircuitStates,

  resetCircuit,

} = require(
  "../../services/payment/paymentCircuitBreakerService"
);

/**
 * =====================================================
 * GET PROVIDER CONFIG
 * =====================================================
 */

async function getProviderConfig(
  req,
  res
) {

  try {

    const config =
      getPaymentRuntimeConfig();

    const circuits =
      getAllCircuitStates();

    return res.json({

      success: true,

      data: {

        config,

        circuits,

      },

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
 * UPDATE PROVIDER CONFIG
 * =====================================================
 */

async function updateProviderConfig(
  req,
  res
) {

  try {

    const updated =
      updatePaymentRuntimeConfig(
        req.body
      );

    return res.json({

      success: true,

      data:
        updated,

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
 * RESET CIRCUIT BREAKER
 * =====================================================
 */

async function resetProviderCircuit(
  req,
  res
) {

  try {

    const {
      provider,
    } = req.params;

    const result =
      resetCircuit(
        provider
      );

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

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  getProviderConfig,

  updateProviderConfig,

  resetProviderCircuit,

};