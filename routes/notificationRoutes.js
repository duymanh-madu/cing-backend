const express =
  require("express");

const router =
  express.Router();

const {

  createNotification,

  getUserNotifications,

  markNotificationRead,

  getUnreadCount,

  broadcastNotification,

} = require(

  "../services/notificationService"

);

/**
 * =========================================
 * TEST
 * =========================================
 */

router.get(
  "/test",
  async (req, res) => {

    res.json({

      success: true,

      route:
        "notification routes working",

    });

  }
);

/**
 * =========================================
 * USER NOTIFICATIONS
 * =========================================
 */

router.get(
  "/user/:userId",

  async (req, res) => {

    try {

      const {
        userId,
      } = req.params;

      const notifications =

        await getUserNotifications(
          userId
        );

      res.json({

        success: true,

        notifications,

      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }
);

/**
 * =========================================
 * UNREAD COUNT
 * =========================================
 */

router.get(
  "/unread/:userId",

  async (req, res) => {

    try {

      const {
        userId,
      } = req.params;

      const count =
        await getUnreadCount(
          userId
        );

      res.json({

        success: true,

        unread: count,

      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }
);

/**
 * =========================================
 * MARK READ
 * =========================================
 */

router.post(
  "/read/:id",

  async (req, res) => {

    try {

      const {
        id,
      } = req.params;

      const notification =

        await markNotificationRead(
          id
        );

      res.json({

        success: true,

        notification,

      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }
);

/**
 * =========================================
 * CREATE SINGLE
 * =========================================
 */

router.post(
  "/create",

  async (req, res) => {

    try {

      const notification =

        await createNotification(
          req.body
        );

      res.json({

        success: true,

        notification,

      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }
);

/**
 * =========================================
 * BROADCAST
 * =========================================
 */

router.post(
  "/broadcast",

  async (req, res) => {

    try {

      await broadcastNotification(
        req.body
      );

      res.json({

        success: true,

      });

    } catch (error) {

      console.log(error);

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