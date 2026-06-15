const express =
  require("express");

const router =
  express.Router();

const {
  getMenu,
} = require(
  "../services/menuService"
);

/**
 * =====================================================
 * GET MENU
 * =====================================================
 */

router.get(
  "/",

  async (
    req,
    res
  ) => {

    try {

      /**
       * ===============================================
       * FETCH MENU
       * ===============================================
       */

      const items =
        await getMenu();

      /**
       * ===============================================
       * SUCCESS
       * ===============================================
       */

      return res.json({

        success: true,

        total:
          items.length,

        items,

      });

    } catch (
      error
    ) {

      console.error(
        "MENU ROUTE ERROR:",
        error
      );

      /**
       * ===============================================
       * ERROR
       * ===============================================
       */

      return res
        .status(500)
        .json({

          success: false,

          message:
            error.message,

          items: [],

        });

    }

  }
);


router.post(
  "/refresh",

  async (
    req,
    res
  ) => {

    try {

      const {
        refreshMenu,
      } = require("../services/foodbook");

      const items =
        await refreshMenu();

      return res.json({
        success: true,
        total: items.length,
        items,
        refreshedAt: new Date().toISOString(),
      });

    } catch (
      error
    ) {

      console.error(
        "MENU REFRESH ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });

    }

  }
);

/**
 * =====================================================
 * TEST ROUTE
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
        "menu routes working",

      realtime: true,

      timestamp:
        Date.now(),

    });

  }
);

/**
 * =====================================================
 * EXPORT
 * =====================================================
 */

module.exports =
  router;