const express =
  require("express");

const router =
  express.Router();

/**
 * =====================================================
 * CMS REMOTE CONFIG
 * =====================================================
 */

router.get(
  "/remote-config",
  async (
    req,
    res,
    next
  ) => {

    try {

      return res.json({

        success: true,

        data: {

          app: {

            name:
              process.env.APP_NAME ||
              "Cing Hu Tang",

            version:
              process.env.APP_VERSION ||
              "1.0.0",

            environment:
              process.env.NODE_ENV ||
              "development",

          },

          features: {

            realtime:
              true,

            miniGame:
              true,

            voucher:
              true,

            loyalty:
              true,

            leaderboard:
              true,

            notifications:
              true,

          },

          ui: {

            theme:
              "dark",

            mobileFirst:
              true,

            webviewOptimized:
              true,

          },

        },

      });

    } catch (error) {

      next(error);

    }

  }
);

/**
 * =====================================================
 * CMS PAGES
 * =====================================================
 */

router.get(
  "/pages/:slug",
  async (
    req,
    res,
    next
  ) => {

    try {

      const {
        slug,
      } = req.params;

      return res.json({

        success: true,

        data: {

          slug,

          title:
            slug,

          sections: [],

          seo: {

            title:
              slug,

            description:
              `${slug} page`,

          },

          updatedAt:
            new Date()
              .toISOString(),

        },

      });

    } catch (error) {

      next(error);

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