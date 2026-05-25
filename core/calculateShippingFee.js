const shippingConfig =
require(
  "../config/shippingConfig"
);

function calculateShippingFee({
  subtotal,
  distanceKm,
}) {

  /**
   * FREESHIP
   */

  if (
    subtotal >=
    shippingConfig.freeShipMinimum
  ) {

    return {

      fee: 0,

      reason:
        "FREESHIP",

    };

  }

  /**
   * DISTANCE RULES
   */

  const matchedRule =
    shippingConfig.distanceRules.find(
      (rule) => {

        return (
          distanceKm >=
            rule.minKm &&
          distanceKm <=
            rule.maxKm
        );

      }
    );

  /**
   * DEFAULT
   */

  if (!matchedRule) {

    return {

      fee: 50000,

      reason:
        "DEFAULT",

    };

  }

  return {

    fee:
      matchedRule.fee,

    reason:
      "DISTANCE_RULE",

  };

}

module.exports =
  calculateShippingFee;