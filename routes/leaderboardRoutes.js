const express =
  require("express");

const router =
  express.Router();

const {

  getGlobalLeaderboard,

  getTopSpenders,

  getGameLeaderboard,

  getUserRank,

} = require(
  "../services/leaderboardService"
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
        "leaderboard routes working",

    });

  }
);

/**
 * ============================================
 * GLOBAL LEADERBOARD
 * ============================================
 */

router.get(
  "/global",
  async (req, res) => {

    try {

      const data =
        await getGlobalLeaderboard();

      res.json({

        success: true,

        data,

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
 * ============================================
 * TOP SPENDERS
 * ============================================
 */

router.get(
  "/top-spenders",
  async (req, res) => {

    try {

      const { period="all", from, to, limit=100 } = req.query;

        const data = await getTopSpenders({ period, from, to, limit: Number(limit) });

      res.json({

        success: true,

        data,

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
 * ============================================
 * GAME TOP
 * ============================================
 */

router.get(
  "/top-games/:gameKey",
  async (req, res) => {

    try {

      const {
        gameKey,
      } = req.params;

      const supabase = require("../supabase");
      const data = await getGameLeaderboard(gameKey, { weekly: true });

      // Lấy rewards config
      let rewards = [];
      try {
        const { data: cfg } = await supabase.from("app_configs")
          .select("leaderboard_config").eq("id", 1).single();
        rewards = cfg?.leaderboard_config?.games?.[gameKey]?.rewards || [];
      } catch(e) {}

      res.json({ success: true, data, rewards });

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
 * ============================================
 * USER RANK
 * ============================================
 */

router.get(
  "/user-rank/:userId",
  async (req, res) => {

    try {

      const {
        userId,
      } = req.params;

      const period = req.query.period || "alltime";
      const data =
        await getUserRank(
          userId, { period }
        );

      res.json({

        success: true,

        data,

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

router.get("/user-game-rank/:userId/:gameKey", async (req, res) => {
  try {
    const { userId, gameKey } = req.params;
    const supabase = require("../supabase");

    // Normalize UUID → phone
    let lookupId = userId;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (isUUID) {
      const { data: customer } = await supabase.from("customers").select("phone").eq("id", userId).maybeSingle();
      if (customer?.phone) lookupId = customer.phone.replace(/\D/g,"").replace(/^84/,"0");
    }

    // Filter weekly (played_at >= last Monday)
    const vnNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    const daysBack = (vnNow.getDay() + 6) % 7;
    const mondayVN = new Date(vnNow);
    mondayVN.setDate(vnNow.getDate() - daysBack);
    mondayVN.setHours(0, 0, 0, 0);
    const monday = new Date(mondayVN.getTime() - 7 * 60 * 60 * 1000);

    const { data: scores } = await supabase
      .from("game_scores")
      .select("user_id, player_name, score")
      .eq("game_key", gameKey)
      .gte("played_at", monday.toISOString())
      .order("score", { ascending: false })
      .limit(2000);

    const all = scores || [];
    // Best per user
    const bestMap = new Map();
    for (const s of all) {
      const uid = String(s.user_id);
      if (!bestMap.has(uid) || s.score > bestMap.get(uid).score) bestMap.set(uid, s);
    }
    const ranked = [...bestMap.values()].sort((a,b) => b.score - a.score);
    const idx = ranked.findIndex(s => String(s.user_id) === String(lookupId));

    if (idx === -1) {
      return res.json({ success: true, data: { rank: null, total: ranked.length, score: 0 } });
    }
    res.json({ success: true, data: { rank: idx + 1, total: ranked.length, score: ranked[idx].score } });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/leaderboard/alltime-top3
router.get("/alltime-top3", async (req, res) => {
  try {
    const supabase = require("../supabase");
    const { data } = await supabase
      .from("players")
      .select("user_id, zalo_name, crm_spend_alltime")
      .gt("crm_spend_alltime", 0)
      .order("crm_spend_alltime", { ascending: false })
      .limit(3);
    res.json({ success: true, data: data || [] });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;