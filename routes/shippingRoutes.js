const express =
  require("express");

const router =
  express.Router();

/**
 * ====================================
 * SHIPPING CONFIG
 * ====================================
 */

const shippingConfig = {

  baseFee: 15000,

  feePerKm: 5000,

  freeShipThreshold:
    200000,

};

/**
 * ====================================
 * CALCULATE SHIPPING
 * ====================================
 */

router.post(
  "/calculate",
  async (
    req,
    res
  ) => {

    try {

      const {
        subtotal,
        distanceKm,
      } = req.body;

      /**
       * FREE SHIP
       */

      if (
        subtotal >=
        shippingConfig.freeShipThreshold
      ) {

        return res.json({

          success: true,

          data: {
            fee: 0,
            reason:
              "FREE_SHIP",
          },

        });

      }

      /**
       * SHIPPING FORMULA
       */

      const fee =
        shippingConfig.baseFee +
        (
          distanceKm *
          shippingConfig.feePerKm
        );

      return res.json({

        success: true,

        data: {
          fee,
          reason:
            "DISTANCE_RULE",
        },

      });

    } catch (error) {

      console.error(
        "SHIPPING ERROR:",
        error
      );

      return res.status(500)
        .json({

          success: false,

          message:
            "Shipping calculate failed",

        });

    }

  }
);

module.exports =
  router;