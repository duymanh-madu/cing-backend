const {
  enrichLeaderboardRowsWithBadges,
} = require("../services/leaderboardBadgeProjectionService");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  isLeaderboardSelfRequest,
  denyLeaderboardCrossUserRead,
} = require("../utils/leaderboardSelfRankAuthority");
const express =
  require("express");

  const {
  gameScoreLimiter,
  spinLimiter,
} = require(
  "../middlewares/rateLimiter"
);

const router =
  express.Router();

const {
  verifyAdmin,
} = require(
  "./adminAuthRoutes"
);

const {
  requireChallengeSuperAdmin,
} = require(
  "../services/games/revival/cingOfflineReviveChallengeAdminGate"
);

const {
  useGamePlay,
  getGameEconomyPolicies,
  saveGameScore,
} = require(
  "../services/gameService"
);

const { normalizePhone } =
  require("../utils/phoneIdentity");

const validateGameScore =
  require(
    "../middlewares/validateGameScore"
  );

/**
 * =====================================================
 * PUBLIC GAME ECONOMY POLICY
 * =====================================================
 */

router.get(
  "/economy-policy",
  async (req, res) => {
    try {
      const data =
        await getGameEconomyPolicies();

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      const statusCode =
        error.statusCode || 500;

      return res
        .status(statusCode)
        .json({
          success: false,
          code:
            error.code ||
            "GAME_ECONOMY_POLICY_FAILED",
          message:
            error.message,
        });
    }
  }
);

/**
 * =====================================================
 * LEGACY USE GAME PLAY — RETIRED
 * =====================================================
 *
 * Game Center V2 starts supported games for free.
 * Keep the V1 URL only as a fail-closed tombstone for
 * stale clients. It must never mutate a play balance.
 */
router.post(
  "/use-play",
  async (req, res) => {
    return res.status(410).json({
      success: false,
      code: "CING_LEGACY_GAME_PLAYS_CLOSED",
      message:
        "Chức năng lượt chơi cũ đã ngừng sử dụng",
    });
  }
);


/**
 * =====================================================
 * SAVE SCORE
 * =====================================================
 */

router.post(
  "/score",
  gameScoreLimiter,
  validateGameScore,
  async (req, res) => {

    try {

      const {

        game_key,
        user_id,
        score,

      } = req.body;

      if (
        !game_key ||
        !user_id ||
        score === undefined
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Thiếu dữ liệu",

        });

      }

      const data =
        await saveGameScore(
          req.body
        );

      res.json({

        success: true,

        data,

      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        success: false,

        message:
          error.message,

      });

    }

  }
);

module.exports =
  router;
// GET /api/game/plays/:userId
router.get("/plays/:userId", async (req, res) => {
  try {
    const supabase = require("../supabase");
    let userId = req.params.userId;

    // Nếu là UUID thì lookup phone
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (isUUID) {
      const { data: customer } = await supabase.from("customers").select("phone").eq("id", userId).maybeSingle();
      if (customer?.phone) userId = normalizePhone(customer.phone);
    }

    const { data: player } = await supabase.from("players").select("game_plays, total_points").eq("user_id", userId).maybeSingle();
    res.json({ success: true, data: { game_plays: player?.game_plays ?? 0, total_points: player?.total_points ?? 0 } });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/game/daily-challenge — lấy tất cả challenges hôm nay
router.get("/daily-challenge", async (req, res) => {
  try {
    const supabase = require("../supabase");
    const { getTodayChallenges } = require("../services/dailyChallengeService");
    const all = await getTodayChallenges();
    res.json({ success: true, data: all });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/game/daily-challenge/reset — Admin xóa challenge hôm nay để tạo lại
router.delete(
  "/daily-challenge/reset",
  verifyAdmin,
  requireChallengeSuperAdmin,
  async (req, res) => {
  try {
    const supabase = require("../supabase");
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const { error: resetError } = await supabase
      .from("daily_challenges")
      .delete()
      .eq("challenge_date", today)
      .not(
        "game_key",
        "in",
        '("black-pearl-rush","cing-stack-tower")'
      );

    if (resetError) throw resetError;
    res.json({ success: true, message: "Đã reset thách thức hôm nay. Sẽ tạo lại khi có request tiếp theo." });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/game/daily-challenge/sync-today — Admin áp dụng config mới cho hôm nay
router.post(
  "/daily-challenge/sync-today",
  verifyAdmin,
  requireChallengeSuperAdmin,
  async (req, res) => {
  try {
    const { syncTodayChallengesFromConfig } = require("../services/dailyChallengeService");
    const data = await syncTodayChallengesFromConfig();
    res.json({ success: true, data });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/game/daily-challenge/claim
router.post("/daily-challenge/claim", async (req, res) => {
  try {
    const { user_id, player_name, avatar, combo, game_key } = req.body;
    if (!user_id || !combo) return res.status(400).json({ success: false, message: "Thiếu thông tin" });
    const { claimChallengeReward } = require("../services/dailyChallengeService");
    const result = await claimChallengeReward({ user_id, player_name, avatar, combo, game_key });
    res.json(result);
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/game/leaderboard/alltime-games

// GET /api/game/leaderboard/alltime-user-rank/:userId/:gameKey
// Private exact-rank projection. Public alltime boards remain Top 10 only.
router.get(
  "/leaderboard/alltime-user-rank/:userId/:gameKey",
  authMiddleware,
  async (req, res) => {
    try {
      const supabase = require("../supabase");

      const { userId, gameKey } = req.params;

      if (
        !isLeaderboardSelfRequest(
          req,
          userId
        )
      ) {
        return denyLeaderboardCrossUserRead(
          res
        );
      }

      const normalizeId = value =>
        String(value || "")
          .replace(/\D/g, "")
          .replace(/^84/, "0");

      let lookupId = normalizeId(userId);

      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          .test(String(userId || ""));

      if (isUUID) {
        const { data: customer } = await supabase
          .from("customers")
          .select("phone")
          .eq("id", userId)
          .maybeSingle();

        if (customer?.phone) {
          lookupId = normalizeId(customer.phone);
        }
      }

      if (!lookupId) {
        return res.json({
          success: true,
          data: { rank:null, total:0, score:0 },
        });
      }

      if (
        gameKey === "chess-wins" ||
        gameKey === "chess-streak"
      ) {
        const { data: chessRows, error } = await supabase
          .from("chess_stats")
          .select(
            "user_id,wins,total_games,best_streak,current_streak"
          )
          .limit(5000);

        if (error) throw error;

        const rows = (chessRows || [])
          .filter(row =>
            gameKey === "chess-wins"
              ? Number(row.wins || 0) > 0
              : Number(row.best_streak || 0) > 0
          )
          .sort((a, b) => {
            const primaryA =
              gameKey === "chess-wins"
                ? Number(a.wins || 0)
                : Number(a.best_streak || 0);

            const primaryB =
              gameKey === "chess-wins"
                ? Number(b.wins || 0)
                : Number(b.best_streak || 0);

            if (primaryB !== primaryA) {
              return primaryB - primaryA;
            }

            if (Number(b.wins || 0) !== Number(a.wins || 0)) {
              return Number(b.wins || 0) - Number(a.wins || 0);
            }

            return (
              Number(b.total_games || 0) -
              Number(a.total_games || 0)
            );
          });

        const idx = rows.findIndex(
          row => normalizeId(row.user_id) === lookupId
        );

        if (idx < 0) {
          return res.json({
            success: true,
            data: {
              rank:null,
              total:rows.length,
              score:0,
            },
          });
        }

        const row = rows[idx];

        return res.json({
          success:true,
          data:{
            rank:idx + 1,
            total:rows.length,
            score:
              gameKey === "chess-wins"
                ? Number(row.wins || 0)
                : Number(row.best_streak || 0),
          },
        });
      }

      const { data: scores, error } = await supabase
        .from("game_scores")
        .select("user_id,score,played_at")
        .eq("game_key", gameKey)
        .order("score", { ascending:false })
        .limit(5000);

      if (error) throw error;

      const bestMap = new Map();

      for (const row of scores || []) {
        const id = normalizeId(row.user_id);
        if (!id) continue;

        const prev = bestMap.get(id);

        if (
          !prev ||
          Number(row.score || 0) > Number(prev.score || 0) ||
          (
            Number(row.score || 0) === Number(prev.score || 0) &&
            new Date(row.played_at).getTime() <
              new Date(prev.played_at).getTime()
          )
        ) {
          bestMap.set(id, row);
        }
      }

      const ranked = [...bestMap.values()].sort((a, b) => {
        if (Number(b.score || 0) !== Number(a.score || 0)) {
          return Number(b.score || 0) - Number(a.score || 0);
        }

        return (
          new Date(a.played_at).getTime() -
          new Date(b.played_at).getTime()
        );
      });

      const idx = ranked.findIndex(
        row => normalizeId(row.user_id) === lookupId
      );

      if (idx < 0) {
        return res.json({
          success:true,
          data:{
            rank:null,
            total:ranked.length,
            score:0,
          },
        });
      }

      res.json({
        success:true,
        data:{
          rank:idx + 1,
          total:ranked.length,
          score:Number(ranked[idx].score || 0),
        },
      });
    } catch (e) {
      res.status(500).json({
        success:false,
        error:e.message,
      });
    }
  }
);

router.get("/leaderboard/alltime-games", async (req, res) => {
  try {
    const supabase = require("../supabase");

    // Đọc config từ DB — admin có thể thêm game mới qua dashboard
    const { data: cfgRow } = await supabase
      .from("app_configs")
      .select("alltime_games_config")
      .eq("id", 1)
      .single();

    const cfg = cfgRow?.alltime_games_config || {};
    const gamesConfig = cfg.games || {
      "black-pearl-rush": { enabled:true, display_name:"Bay cùng trân châu", icon:"🫧" },
      "cing-stack-tower": { enabled:true, display_name:"Xếp Tháp Cing", icon:"🧱" },
    };

    // Chỉ lấy game đang enabled
    const validGames = Object.entries(gamesConfig)
      .filter(([, g]) => g.enabled !== false)
      .map(([key]) => key);

    if (validGames.length === 0) return res.json({ success:true, data:[] });

    // All Time B2.20: score scales differ between games.
    // A global Top 500 would exclude low-scale games such as
    // black-pearl-rush even when historical scores exist.
    const scoreGameKeys = validGames.filter(
      key => !["chess", "chess-wins", "chess-streak"].includes(key)
    );

    const gameScoreGroups = await Promise.all(
      scoreGameKeys.map(async gameKey => {
        const rows = [];
        const players = new Set();
        const batchSize = 500;
        const maxRows = 20000;

        for (let offset = 0; offset < maxRows; offset += batchSize) {
          const { data: page, error } = await supabase
            .from("game_scores")
            .select("user_id, player_name, avatar, score, game_key")
            .eq("game_key", gameKey)
            .order("score", { ascending: false })
            .range(offset, offset + batchSize - 1);

          if (error) throw error;

          for (const row of page || []) {
            rows.push(row);
            if (row.user_id != null) {
              players.add(String(row.user_id));
            }
          }

          // Preserve the original Top 100 per-game contract.
          // A partial final page proves the scan is exhausted.
          if ((page || []).length < batchSize || players.size >= 100) {
            return rows;
          }
        }

        // Never silently publish a truncated leaderboard.
        throw new Error(
          "alltime_game_score_scan_cap_reached:" + gameKey
        );
      })
    );

    const data = gameScoreGroups.flat();

    // Group by game_key + user_id, lấy best score mỗi user mỗi game
    const byGame = {};
    (data || []).forEach(row => {
      if (!byGame[row.game_key]) byGame[row.game_key] = {};
      if (!byGame[row.game_key][row.user_id] || byGame[row.game_key][row.user_id].score < row.score) {
        byGame[row.game_key][row.user_id] = row;
      }
    });

    let chessWinsData = [];
let chessStreakData = [];

if (
  validGames.includes("chess") ||
  validGames.includes("chess-wins") ||
  validGames.includes("chess-streak")
) {

  const { data: chessStats } = await supabase
    .from("chess_stats")
    .select(
      "user_id,wins,losses,draws,total_games,best_streak,current_streak"
    )
    .limit(500);

  const chessIds =
    (chessStats || []).map(
      s => s.user_id
    );

  const { data: chessPlayers } =
    chessIds.length
      ? await supabase
          .from("players")
          .select(
            "user_id,display_name,zalo_name,avatar"
          )
          .in(
            "user_id",
            chessIds
          )
      : { data: [] };

  const cpMap =
    new Map(
      (chessPlayers || [])
        .map(
          p => [p.user_id, p]
        )
    );

  chessWinsData =
    [...(chessStats || [])]
      .sort(
        (a,b) =>
          (b.wins || 0) -
          (a.wins || 0)
      )
      .map((s,i) => {

        const p =
          cpMap.get(
            s.user_id
          );

        return {
          rank: i + 1,
          user_id: s.user_id,
          player_name:
            p?.display_name ||
            p?.zalo_name ||
            "Cing iu",
          avatar:
            p?.avatar || "",
          score:
            s.wins || 0,
          wins:
            s.wins || 0,
          total_games:
            s.total_games || 0,
          winRate:
            s.total_games > 0
              ? Number(
                  (
                    s.wins /
                    s.total_games *
                    100
                  ).toFixed(1)
                )
              : 0,
        };
      });

  chessStreakData =
    [...(chessStats || [])]
      .sort(
        (a,b) =>
          (b.best_streak || 0) -
          (a.best_streak || 0)
      )
      .map((s,i) => {

        const p =
          cpMap.get(
            s.user_id
          );

        return {
          rank: i + 1,
          user_id: s.user_id,
          player_name:
            p?.display_name ||
            p?.zalo_name ||
            "Cing iu",
          avatar:
            p?.avatar || "",
          score:
            s.best_streak || 0,
          best_streak:
            s.best_streak || 0,
          current_streak:
            s.current_streak || 0,
          wins:
            s.wins || 0,
        };
      });
}

    const result = validGames.map(gameKey => {
      if (gameKey === "chess") {
  return {
    game_key: "chess",
    display_name: gamesConfig["chess"]?.display_name || "Kỳ thủ cờ vua",
    icon: gamesConfig["chess"]?.icon || "♟️",
    score_label: "Số trận thắng",
    data: chessWinsData.slice(0, 10),
  };
}

if (gameKey === "chess-wins") {
  return {
    game_key: "chess-wins",
    display_name:
      gamesConfig["chess-wins"]?.display_name ||
      "Kỳ thủ cờ vua",
    icon:
      gamesConfig["chess-wins"]?.icon ||
      "♟️",
    score_label:
      "Số trận thắng",
    data:
      chessWinsData.slice(0,10),
  };
}

if (gameKey === "chess-streak") {
  return {
    game_key: "chess-streak",
    display_name:
      gamesConfig["chess-streak"]?.display_name ||
      "Chuỗi thắng dài nhất",
    icon:
      gamesConfig["chess-streak"]?.icon ||
      "🔥",
    score_label:
      "Chuỗi thắng",
    data:
      chessStreakData.slice(0,10),
  };
}
      if (!byGame[gameKey]) return null;
      return {
        game_key:     gameKey,
        display_name: gamesConfig[gameKey]?.display_name || gameKey,
        icon:         gamesConfig[gameKey]?.icon || "🎮",
        score_label:  "Điểm cao nhất",
        data:         Object.values(byGame[gameKey])
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map((e, i) => ({ ...e, rank: i + 1 })),
      };
    }).filter(Boolean);

    const enrichedResult =
      await Promise.all(
        (result || []).map(
          async game => ({
            ...game,
            data:
              await enrichLeaderboardRowsWithBadges(
                game?.data || []
              ),
          })
        )
      );

    res.json({
      success:true,
      data:enrichedResult,
    });
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
});
