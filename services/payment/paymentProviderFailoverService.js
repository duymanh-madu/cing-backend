const {

  canProviderExecute,

} = require(
  "./paymentCircuitBreakerService"
);

const {

  getProvider,

} = require(
  "./paymentProviderRegistry"
);

/**
 * =====================================================
 * PROVIDER PRIORITY
 * =====================================================
 */

const PROVIDER_PRIORITY =
  [

    "momo",

    "zalopay",

    "vnpay",

    "banking",

  ];

/**
 * =====================================================
 * FIND AVAILABLE PROVIDER
 * =====================================================
 */

function findAvailableProvider() {

  for (
    const providerName of
    PROVIDER_PRIORITY
  ) {

    const allowed =
      canProviderExecute(
        providerName
      );

    if (!allowed) {

      continue;

    }

    const provider =
      getProvider(
        providerName
      );

    if (
      provider
    ) {

      return {

        providerName,

        provider,

      };

    }

  }

  return null;

}

/**
 * =====================================================
 * GET FAILOVER PROVIDER
 * =====================================================
 */

function getFailoverProvider({

  currentProvider,

}) {

  const candidates =
    PROVIDER_PRIORITY.filter(
      (
        provider
      ) =>
        provider !==
        currentProvider
    );

  for (
    const providerName of
    candidates
  ) {

    const allowed =
      canProviderExecute(
        providerName
      );

    if (!allowed) {

      continue;

    }

    const provider =
      getProvider(
        providerName
      );

    if (
      provider
    ) {

      return {

        providerName,

        provider,

      };

    }

  }

  return null;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  findAvailableProvider,

  getFailoverProvider,

};