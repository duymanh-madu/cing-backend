const express =
  require("express");

const router =
  express.Router();

/**
 * =========================================================
 * APP RUNTIME CONFIG
 * =========================================================
 */

router.get(
  "/config",
  async (req, res) => {

    try {

      return res.status(200).json({

        success: true,

        data: {

          app: {

            name:
              "Cing Hu Tang",

            mode:
              process.env.NODE_ENV ||
              "development",

            version:
              "1.0.0",

          },

          realtime: {

            enabled: true,

            socketEnabled: true,

            socketUrl:
              process.env
                .SOCKET_URL ||
              "http://localhost:5050",

          },

          maintenance: {

            enabled: false,

            message: "",

          },

          features: {

            home: true,

            menu: true,

            game: true,

            voucher: true,

            membership: true,

            leaderboard: true,

          },

          navigation: [

            {
              id: "home",

              label:
                "Trang chủ",

              path: "/",

              icon: "home",

              feature:
                "home",
            },

            {
              id: "menu",

              label:
                "Menu",

              path: "/menu",

              icon: "menu",

              feature:
                "menu",
            },

            {
              id: "game",

              label:
                "Mini Game",

              path: "/game",

              icon: "game",

              feature:
                "game",
            },

            {
              id:
                "leaderboard",

              label: "BXH",

              path:
                "/leaderboard",

              icon:
                "membership",

              feature:
                "leaderboard",
            },

            {
              id:
                "account",

              label:
                "Tài khoản",

              path:
                "/account",

              icon:
                "membership",

              feature:
                "membership",
            },

          ],

          server: {

            api:
              process.env
                .API_URL ||
              "http://localhost:5050",

            timestamp:
              Date.now(),

          },

        },

      });

    } catch (error) {

      return res.status(500).json({

        success: false,

        message:
          "Failed to load app config",

        error:
          process.env
            .NODE_ENV ===
          "development"
            ? error.message
            : undefined,

      });

    }

  }
);

module.exports =
  router;