const {
  enrichLeaderboardRowsWithBadges,
} = require("../services/leaderboardBadgeProjectionService");
const express  = require("express");
const router   = express.Router();
const supabase = require("../supabase");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  isLeaderboardSelfRequest,
  denyLeaderboardCrossUserRead,
} = require("../utils/leaderboardSelfRankAuthority");

function resolvePlayerName(player, fallback = "Cing iu") {
  return (
    player?.display_name ||
    player?.zalo_name ||
    player?.name ||
    fallback
  );
}

function normalizeUserId(v) {
  return String(v || "").replace(/\D/g, "").replace(/^84/, "0");
}

// GET /game/chess/leaderboard - BXH 2 phần

// GET /game/chess/leaderboard/user-rank/:userId
// Private projection: exact viewer rank without exposing ranks 11+ publicly.
router.get("/leaderboard/user-rank/:userId", authMiddleware, async (req, res) => {
  try {
    if (
      !isLeaderboardSelfRequest(
        req,
        req.params.userId
      )
    ) {
      return denyLeaderboardCrossUserRead(
        res
      );
    }

    let lookupId = normalizeUserId(req.params.userId);

    const rawId = String(req.params.userId || "");
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        .test(rawId);

    if (isUUID) {
      const { data: customer } = await supabase
        .from("customers")
        .select("phone")
        .eq("id", rawId)
        .maybeSingle();

      if (customer?.phone) {
        lookupId = normalizeUserId(customer.phone);
      }
    }

    if (!lookupId) {
      return res.json({
        success: true,
        data: {
          wins: { rank:null, total:0, score:0 },
          streak: { rank:null, total:0, score:0 },
        },
      });
    }

    const { data: stats, error } = await supabase
      .from("chess_stats")
      .select(
        "user_id,wins,losses,draws,total_games,best_streak,current_streak"
      )
      .limit(5000);

    if (error) throw error;

    const rows = stats || [];

    const winsRows = [...rows]
      .filter(row => Number(row.wins || 0) > 0)
      .sort((a, b) => {
        if (Number(b.wins || 0) !== Number(a.wins || 0)) {
          return Number(b.wins || 0) - Number(a.wins || 0);
        }
        return Number(b.total_games || 0) - Number(a.total_games || 0);
      });

    const streakRows = [...rows]
      .filter(row => Number(row.best_streak || 0) > 0)
      .sort((a, b) => {
        if (
          Number(b.best_streak || 0) !==
          Number(a.best_streak || 0)
        ) {
          return (
            Number(b.best_streak || 0) -
            Number(a.best_streak || 0)
          );
        }

        if (Number(b.wins || 0) !== Number(a.wins || 0)) {
          return Number(b.wins || 0) - Number(a.wins || 0);
        }

        return Number(b.total_games || 0) - Number(a.total_games || 0);
      });

    const project = (ranked, scoreKey) => {
      const idx = ranked.findIndex(
        row => normalizeUserId(row.user_id) === lookupId
      );

      if (idx < 0) {
        return {
          rank: null,
          total: ranked.length,
          score: 0,
        };
      }

      const row = ranked[idx];

      return {
        rank: idx + 1,
        total: ranked.length,
        score: Number(row?.[scoreKey] || 0),
        wins: Number(row?.wins || 0),
        total_games: Number(row?.total_games || 0),
        best_streak: Number(row?.best_streak || 0),
        current_streak: Number(row?.current_streak || 0),
      };
    };

    res.json({
      success: true,
      data: {
        wins: project(winsRows, "wins"),
        streak: project(streakRows, "best_streak"),
      },
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e.message,
    });
  }
});

router.get("/leaderboard", async (req, res) => {
  try {
    const { data: topWins, error: winsErr } = await supabase
      .from("chess_stats")
      .select("user_id, wins, losses, draws, total_games")
      .order("wins", { ascending: false })
      .order("total_games", { ascending: false })
      .limit(10);

    if (winsErr) throw winsErr;

    const { data: topStreak, error: streakErr } = await supabase
      .from("chess_stats")
      .select("user_id, best_streak, current_streak, wins, total_games")
      .order("best_streak", { ascending: false })
      .order("wins", { ascending: false })
      .order("total_games", { ascending: false })
      .limit(10);

    if (streakErr) throw streakErr;

    const allIds = [
      ...new Set([
        ...(topWins || []).map(p => normalizeUserId(p.user_id)).filter(Boolean),
        ...(topStreak || []).map(p => normalizeUserId(p.user_id)).filter(Boolean),
      ]),
    ];

    const { data: players } = allIds.length
      ? await supabase
          .from("players")
          .select("user_id, display_name, zalo_name, name, avatar")
          .in("user_id", allIds)
      : { data: [] };

    const pMap = new Map((players || []).map(p => [String(p.user_id), p]));

    const enrichWins = (topWins || []).map((s, i) => {
      const uid = normalizeUserId(s.user_id);
      const p = pMap.get(uid);

      return {
        rank: i + 1,
        user_id: uid || s.user_id,
        name: resolvePlayerName(p, uid || s.user_id),
        avatar: p?.avatar || "",
        wins: s.wins || 0,
        losses: s.losses || 0,
        draws: s.draws || 0,
        total_games: s.total_games || 0,
        winRate: s.total_games > 0 ? Math.round((s.wins || 0) / s.total_games * 100) : 0,
      };
    });

    const enrichStreak = (topStreak || []).map((s, i) => {
      const uid = normalizeUserId(s.user_id);
      const p = pMap.get(uid);

      return {
        rank: i + 1,
        user_id: uid || s.user_id,
        name: resolvePlayerName(p, uid || s.user_id),
        avatar: p?.avatar || "",
        best_streak: s.best_streak || 0,
        current_streak: s.current_streak || 0,
        wins: s.wins || 0,
        total_games: s.total_games || 0,
      };
    });

    const [
      ownedTopWins,
      ownedTopStreak,
    ] = await Promise.all([
      enrichLeaderboardRowsWithBadges(enrichWins),
      enrichLeaderboardRowsWithBadges(enrichStreak),
    ]);

    res.json({
      success:true,
      data:{
        topWins:ownedTopWins,
        topStreak:ownedTopStreak,
      },
    });
  } catch (e) {
    console.error("[CHESS LEADERBOARD] Error:", e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /game/chess/game-ended - được gọi từ game server sau khi ván kết thúc
router.post("/game-ended", async (req, res) => {
  res.json({ ok: true });

  const { winner_id, winner, winnerId: winnerIdRaw } = req.body || {};
  const winnerId = normalizeUserId(winnerIdRaw || winner_id || winner);

  if (winnerId) {
    try {
      const { data: stats } = await supabase
        .from("chess_stats")
        .select("wins, wins_today, wins_today_date")
        .eq("user_id", winnerId)
        .maybeSingle();

      const todayVN = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
      const winsTodayDate = stats?.wins_today_date ? String(stats.wins_today_date).slice(0, 10) : "";
      const winsToday = winsTodayDate === todayVN ? Number(stats?.wins_today || 0) : 0;
      const wins = winsToday;
      console.log(`[CHESS] game-ended winner=${winnerId} wins_today=${winsToday}`);

      const {
        completeManualMission,
        getMissionConfigs,
      } = require("../services/dailyMissionService");

      const configs =
        await getMissionConfigs();

      const winCfg =
        configs.find(
          c =>
            c.condition_type ===
              "manual" &&
            c.type ===
              "win"
        );

      const winTarget =
        Number(
          winCfg?.condition_value ||
          winCfg?.target_value ||
          winCfg?.target ||
          5
        );

      if (
        winCfg &&
        wins >= winTarget
      ) {
        const result =
          await completeManualMission({
            user_id:
              winnerId,
            mission_type:
              "win",
            config:
              winCfg,
          });

        if (result.applied) {
          console.log(
            result.reward_currency === "revive_credit"
              ? `[CHESS] Win mission awarded: ${winnerId} +${result.revive_credits_awarded} Revive Credit +${result.points_awarded} points`
              : `[CHESS] Win mission awarded: ${winnerId} +${result.plays_awarded} plays +${result.points_awarded} points`
          );
        }
      }
    } catch (e) {
      console.warn("[CHESS] Win mission check failed:", e.message);
    }

    // Check daily challenge — thắng N trận
    try {
      const { claimChallengeReward } = require("../services/dailyChallengeService");
      const { data: playerInfo } = await supabase.from("players")
        .select("display_name, zalo_name, avatar").eq("user_id", winnerId).single();
      const { data: chessStats } = await supabase.from("chess_stats")
        .select("wins_today, wins_today_date").eq("user_id", winnerId).single();

      const todayVN2 = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
      const winsTodayChallenge = chessStats?.wins_today_date === todayVN2 ? (chessStats?.wins_today || 0) : 0;

      const result = await claimChallengeReward({
        user_id:     winnerId,
        player_name: playerInfo?.display_name || playerInfo?.zalo_name || "Cing iu",
        avatar:      playerInfo?.avatar || "",
        score:       winsTodayChallenge,
        game_key:    "chess",
      });
      if (result.success) {
        console.log(`[CHESS] Daily challenge claimed by ${winnerId}: +${result.reward_points} pts`);
      }
    } catch(e) {
      console.warn("[CHESS] Daily challenge check failed:", e.message);
    }
  }

  try {
    const { checkAndNotifyTop1Changes } = require("../services/leaderboardResetService");
    const io = global._ioInstance;
    await checkAndNotifyTop1Changes(io);
  } catch (e) {
    console.warn("[TOP1] Chess game-ended check:", e.message);
  }
});

// POST /api/chess/tip — tặng vật phẩm trong ván cờ
router.post(
  "/tip",
  (req, res, next) => {
    if (
      process.env.CING_GAME_GIFT_V2_CUTOVER_ENABLED === "true"
    ) {
      return res.status(410).json({
        success: false,
        code: "LEGACY_GIFT_DISABLED",
      });
    }

    return next();
  },
  async (req, res) => {
  res.json({ success: true });

  try {
    const {
      fromUserId,
      toUserId,
      amount,
      charm,
      giftId,
      giftName,
      giftIcon,
    } = req.body || {};

    const fromId = normalizeUserId(fromUserId);
    const toId   = normalizeUserId(toUserId);

    if (!fromId || !toId || !amount) return;

    const validAmounts = [5, 10, 20, 50, 100];
    const pointAmount = Number(amount);

    if (!validAmounts.includes(pointAmount)) return;

    const { data: player } = await supabase
      .from("players")
      .select("total_points")
      .eq("user_id", fromId)
      .single();

    const currentPoints = Number(player?.total_points || 0);

    if (currentPoints < pointAmount) {
      console.warn(`[CHESS GIFT] ${fromId} không đủ điểm: có ${currentPoints}, cần ${pointAmount}`);
      return;
    }

    const { data: giftPlayers } = await supabase
      .from("players")
      .select("user_id, display_name, zalo_name, name")
      .in("user_id", [fromId, toId]);

    const playerMap = new Map((giftPlayers || []).map(p => [String(p.user_id), p]));
    const fromPlayer = playerMap.get(fromId);
    const toPlayer = playerMap.get(toId);

    const fromName = resolvePlayerName(fromPlayer, "Cing iu");
    const toName = resolvePlayerName(toPlayer, "Cing iu");

    const { deductPoints } = require("../services/loyaltyPointService");

    await deductPoints({
      phone: fromId,
      user_id: fromId,
      points: pointAmount,
      reason: `Tặng ${giftName || "vật phẩm"} cho ${toName} trong ván cờ`,
    });

    const charmAmount = Number(charm || amount);

    const { data: rec } = await supabase
      .from("players")
      .select("charm_points")
      .eq("user_id", toId)
      .maybeSingle();

    const newCharm = Number(rec?.charm_points || 0) + charmAmount;

    await supabase
      .from("players")
      .update({ charm_points: newCharm })
      .eq("user_id", toId);

    const { error: notifErr } = await supabase.from("notifications").insert({
      user_id: toId,
      type: "gift_received",
      title: `${fromName} đã tặng bạn ${giftIcon || ""} ${giftName || "vật phẩm"}`,
      message: `+${charmAmount} điểm quyến rũ`,
      metadata: {
        fromUserId: fromId,
        fromName,
        giftId,
        giftName,
        giftIcon,
        charm: charmAmount,
      },
      is_read: false,
    });

    if (notifErr) console.warn("[GIFT NOTIF ERROR]", notifErr.message);
    else console.log("[GIFT NOTIF] Saved for", toId);

    const io = global._ioInstance;

    if (io) {
      io.emit("chess:tip_received", {
        fromUserId: fromId,
        toUserId: toId,
        amount: pointAmount,
        charm: charmAmount,
        giftId,
        giftName,
        giftIcon,
        fromName,
      });

      const giftTitle = `${fromName} đã tặng bạn ${giftIcon || ""} ${giftName || "vật phẩm"}`;
      const giftBody = `+${charmAmount} điểm quyến rũ`;

      io.emit("notification:new", {
        userId: toId,
        title: giftTitle,
        body: giftBody,
        type: "gift_received",
      });

      // Lưu DB — đảm bảo người nhận offline vẫn thấy khi vào lại app
      supabase.from("notifications").insert({
        user_id: toId,
        title: giftTitle,
        message: giftBody,
        type: "gift_received",
        is_read: false,
        created_at: new Date().toISOString(),
      }).then(() => {}).catch(e => console.warn("[CHESS GIFT] notification insert failed:", e.message));
    }

    console.log(`[CHESS GIFT] ${fromId} → ${toId}: ${giftName} (+${charmAmount} charm) newCharm=${newCharm}`);
  } catch (e) {
    console.warn("[CHESS GIFT] Error:", e.message);
  }
});

module.exports = router;
