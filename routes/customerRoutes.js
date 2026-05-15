const express =
  require("express");

const router =
  express.Router();

/**
 * =====================================================
 * CUSTOMER PROFILE
 * =====================================================
 */

router.get(
  "/me",
  async (
    req,
    res,
    next
  ) => {

    try {

      /**
       * ============================================
       * REQUEST CONTEXT
       * ============================================
       */

      const customer =
        req.customer ||
        null;

      /**
       * ============================================
       * GUEST MODE
       * ============================================
       */

      if (!customer) {

        return res.json({

          success: true,

          data: {

            authenticated:
              false,

            profile: {

              id:
                null,

              zaloId:
                null,

              zaloName:
                "Guest",

              avatar:
                null,

            },

            membership: {

              level:
                "standard",

              points:
                0,

              totalOrders:
                0,

            },

            realtime: {

              connected:
                false,

            },

          },

        });

      }

      /**
       * ============================================
       * AUTHENTICATED CUSTOMER
       * ============================================
       */

      return res.json({

        success: true,

        data: {

          authenticated:
            true,

          profile: {

            id:
              customer.id,

            zaloId:
              customer.zaloId,

            zaloName:
              customer.zaloName,

            avatar:
              customer.avatar,

          },

          membership: {

            level:
              customer.memberLevel ||
              "standard",

            points:
              customer.points ||
              0,

            totalOrders:
              customer.totalOrders ||
              0,

          },

          realtime: {

            connected:
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
 * EXPORTS
 * =====================================================
 */

module.exports =
  router;