const express = require("express");

const router = express.Router();

const {
  getMenuForApp,
  refreshMenuFromIPOS,
} = require("../services/menu/menuSyncService");

/**
 * App menu: read stable DB source.
 */
router.get("/", async (req, res) => {
  try {
    const items = await getMenuForApp();

    return res.json({
      success: true,
      source: "db",
      total: items.length,
      items,
    });
  } catch (error) {
    console.error("MENU ROUTE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
      items: [],
    });
  }
});

/**
 * Manual/live sync from iPOS.
 */
router.post("/refresh", async (req, res) => {
  try {
    const result = await refreshMenuFromIPOS({
      reason: "manual_refresh",
    });

    if (!result.success) {
      return res.status(502).json(result);
    }

    return res.json({
      success: true,
      source: result.source,
      total: result.count,
      menuType: result.menuType,
      dbSync: result.dbSync,
      attempts: result.attempts,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("MENU REFRESH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.get("/test", (req, res) => {
  return res.json({
    success: true,
    route: "menu routes working",
    timestamp: Date.now(),
  });
});

module.exports = router;
