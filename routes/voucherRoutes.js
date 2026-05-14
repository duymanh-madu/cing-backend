const express =
  require("express");

const router =
  express.Router();

/**
 * =====================================================
 * MIDDLEWARES
 * =====================================================
 */

const authMiddleware =
  require(
    "../middlewares/authMiddleware"
  );

/**
 * =====================================================
 * SERVICES
 * =====================================================
 */

const {

  validateVoucher,

  claimVoucher,

  getUserVouchers,

} = require(
  "../services/voucherService"
);

/**
 * =====================================================
 * TEST
 * =====================================================
 */

router.get(
  "/test",

  (
    req,
    res
  ) => {

    return res.json({

      success: true,

      route:
        "voucher routes working",

      timestamp:
        new Date(),

    });

  }

);

/**
 * =====================================================
 * VALIDATE VOUCHER
 * =====================================================
 */

router.post(

  "/validate",

  authMiddleware,

  async (
    req,
    res
  ) => {

    try {

      const result =

        await validateVoucher({

          user_id:

            req.user.user_id,

          ...req.body,

        });

      return res.json(result);

    } catch (error) {

      console.error(

        "validate voucher error:",

        error.message

      );

      return res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }

);

/**
 * =====================================================
 * CLAIM VOUCHER
 * =====================================================
 */

router.post(

  "/claim",

  authMiddleware,

  async (
    req,
    res
  ) => {

    try {

      /**
       * ============================================
       * MEMBER ACTIVATED CHECK
       * ============================================
       */

      if (

        !req.user
          ?.user_id

      ) {

        return res.status(401).json({

          success: false,

          message:
            "Unauthorized",

        });

      }

      /**
       * ============================================
       * CLAIM
       * ============================================
       */

      const result =

        await claimVoucher({

          user_id:

            req.user.user_id,

          ...req.body,

        });

      return res.json(result);

    } catch (error) {

      console.error(

        "claim voucher error:",

        error.message

      );

      return res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }

);

/**
 * =====================================================
 * GET AVAILABLE VOUCHERS
 * =====================================================
 */

router.get(

  "/available",

  authMiddleware,

  async (
    req,
    res
  ) => {

    try {

      const {

        page = 1,

        limit = 20,

      } = req.query;

      const result =

        await getUserVouchers({

          user_id:

            req.user.user_id,

          tab:
            "available",

          page:
            Number(page),

          limit:
            Number(limit),

        });

      return res.json(result);

    } catch (error) {

      console.error(

        "get available vouchers error:",

        error.message

      );

      return res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }

);

/**
 * =====================================================
 * GET VOUCHER HISTORY
 * =====================================================
 */

router.get(

  "/history",

  authMiddleware,

  async (
    req,
    res
  ) => {

    try {

      const {

        page = 1,

        limit = 20,

      } = req.query;

      const result =

        await getUserVouchers({

          user_id:

            req.user.user_id,

          tab:
            "history",

          page:
            Number(page),

          limit:
            Number(limit),

        });

      return res.json(result);

    } catch (error) {

      console.error(

        "get voucher history error:",

        error.message

      );

      return res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }

);

/**
 * =====================================================
 * GET ALL USER VOUCHERS
 * =====================================================
 */

router.get(

  "/my-vouchers",

  authMiddleware,

  async (
    req,
    res
  ) => {

    try {

      const {

        tab = "all",

        page = 1,

        limit = 20,

      } = req.query;

      const result =

        await getUserVouchers({

          user_id:

            req.user.user_id,

          tab,

          page:
            Number(page),

          limit:
            Number(limit),

        });

      return res.json(result);

    } catch (error) {

      console.error(

        "get user vouchers error:",

        error.message

      );

      return res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }

);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;