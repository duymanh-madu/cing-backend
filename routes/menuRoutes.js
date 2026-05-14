const express =
  require("express");

const router =
  express.Router();

const {
  getMenu,
} = require(
  "../services/menuService"
);

const {
  syncMenuFromIPOS,
} = require(
  "../services/menuSyncService"
);

/**
 * ============================================
 * GET MENU
 * ============================================
 */

router.get(

  "/",

  async (
    req,
    res
  ) => {

    try {

      const data =
        await getMenu();

      res.json({

        success: true,

        data,

      });

    } catch (error) {

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
 * SYNC MENU
 * ============================================
 */

router.post(

  "/sync",

  async (
    req,
    res
  ) => {

    try {

      const result =

        await syncMenuFromIPOS();

      res.json(result);

    } catch (error) {

      res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }

);

module.exports =
  router;