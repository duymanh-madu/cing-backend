const express =
  require("express");

const router =
  express.Router();

const {

  getCampaignTop,

  getCampaignConfig,

  refreshCampaignCache,

  getCampaignCache,

} = require(

  "../services/campaignService"

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
        "campaign routes working",

    });

  }
);

/**
 * ============================================
 * CAMPAIGN LEADERBOARD
 * ============================================
 */

router.get(
  "/leaderboard/:campaign_key",

  async (req, res) => {

    try {

      const {
        campaign_key,
      } = req.params;

      const data =
        await getCampaignTop(
          campaign_key
        );

      return res.json({

        success: true,

        leaderboard:
          data,

      });

    } catch (error) {

      console.error(error);

      return res
        .status(500)
        .json({

          success: false,

          error:
            error.message,

        });

    }

  }
);

/**
 * ============================================
 * CAMPAIGN CONFIG
 * ============================================
 */

router.get(
  "/config/:campaign_key",

  async (req, res) => {

    try {

      const {
        campaign_key,
      } = req.params;

      const data =
        await getCampaignConfig(
          campaign_key
        );

      return res.json({

        success: true,

        config:
          data,

      });

    } catch (error) {

      console.error(error);

      return res
        .status(500)
        .json({

          success: false,

          error:
            error.message,

        });

    }

  }
);

/**
 * ============================================
 * CAMPAIGN CACHE
 * ============================================
 */

router.get(
  "/cache/:campaign_key",

  async (req, res) => {

    try {

      const {
        campaign_key,
      } = req.params;

      /**
       * REFRESH CACHE
       */

      await refreshCampaignCache(
        campaign_key
      );

      /**
       * GET CACHE
       */

      const cache =
        await getCampaignCache(
          campaign_key
        );

        /**
 * SOCKET EMIT
 */
const io =
  req.app.get("io");
io.emit(
  "campaign_update",
  {
    campaign_key,
    leaderboard:
      cache?.leaderboard ||
      [],
  }
);

      return res.json({

        success: true,

        cache,

      });

    } catch (error) {

      console.error(error);

      return res
        .status(500)
        .json({

          success: false,

          error:
            error.message,

        });

    }

  }
);

module.exports =
  router;