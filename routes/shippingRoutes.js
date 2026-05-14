const express =
  require("express");

const router =
  express.Router();

const {

  calculateDistance,

  calculateShippingFee,

} = require(
  "../services/shippingService"
);

/**
 * ============================================
 * TEST
 * ============================================
 */

router.get(
  "/test",

  async (req, res) => {

    res.json({

      success: true,

      route:
        "shipping routes working",

    });

  }
);

/**
 * ============================================
 * CALCULATE DISTANCE
 * ============================================
 */

router.post(

  "/distance",

  async (req, res) => {

    try {

      const {

        destination_latitude,

        destination_longitude,

      } = req.body;

      /**
       * VALIDATE
       */

      if (

        destination_latitude ===
          undefined ||

        destination_longitude ===
          undefined

      ) {

        return res.status(400).json({

          success: false,

          message:
            "Missing destination coordinates",

        });

      }

      /**
       * CALCULATE
       */

      const result =

        await calculateDistance({

          destination_latitude,

          destination_longitude,

        });

      /**
       * RESPONSE
       */

      res.json({

        success: true,

        ...result,

      });

    } catch (error) {

      console.error(

        "distance route error:",

        error.message

      );

      res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }

);

/**
 * ============================================
 * CALCULATE SHIPPING
 * ============================================
 */

router.post(

  "/calculate",

  async (req, res) => {

    try {

      const {

        total_amount,

        destination_latitude,

        destination_longitude,

      } = req.body;

      /**
       * VALIDATE
       */

      if (

        total_amount ===
          undefined ||

        destination_latitude ===
          undefined ||

        destination_longitude ===
          undefined

      ) {

        return res.status(400).json({

          success: false,

          message:
            "Missing shipping data",

        });

      }

      /**
       * CALCULATE
       */

      const result =

        await calculateShippingFee({

          total_amount,

          destination_latitude,

          destination_longitude,

        });

      /**
       * RESPONSE
       */

      res.json(result);

    } catch (error) {

      console.error(

        "shipping route error:",

        error.message

      );

      res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }

);

/**
 * ============================================
 * EXPORT
 * ============================================
 */

module.exports =
  router;