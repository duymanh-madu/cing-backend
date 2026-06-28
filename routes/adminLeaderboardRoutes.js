const express  = require("express");
const router   = express.Router();
const jwt      = require("jsonwebtoken");
const supabase = require("../supabase");
const { addPoints } = require("../services/loyaltyPointService");

const JWT_SECRET = process.env.JWT_SECRET || "cing-admin-secret-2026";

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ success: false, message: "Token không hợp lệ" }); }
}

// GET /admin/leaderboard/config
router.get("/config", requireAdmin, async (req, res) => {
  try {
    const { data } = await supabase.from("app_configs")
      .select("leaderboard_config").eq("id", 1).single();
    res.json({ success: true, data: data?.leaderboard_config || {} });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /admin/leaderboard/config
router.put("/config", requireAdmin, async (req, res) => {
  try {
    const { leaderboard_config } = req.body;
    const { error } = await supabase.from("app_configs")
      .update({ leaderboard_config }).eq("id", 1);
    if (error) throw error;
    res.json({ success: true, message: "Đã lưu cấu hình bảng xếp hạng" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/leaderboard/distribute-rewards
// Phát thưởng cho top players của 1 period/game
router.post("/distribute-rewards", requireAdmin, async (req, res) => {
  try {
    const { type, period, game_key } = req.body;
    // type = "spending" | "game"

    const { data: configRow } = await supabase.from("app_configs")
      .select("leaderboard_config").eq("id", 1).single();
    const config = configRow?.leaderboard_config || {};

    let rewards = [];
    let topPlayers = [];

    if (type === "spending") {
      const periodConfig = config.spending?.[period];
      if (!periodConfig?.enabled) return res.status(400).json({ success: false, error: "Period không được bật" });
      rewards = periodConfig.rewards || [];

      const col = { weekly:"crm_spend_weekly", monthly:"crm_spend_monthly",
        quarterly:"crm_spend_quarterly", alltime:"crm_spend_alltime" }[period] || "crm_spend_alltime";

      const { data } = await supabase.from("players")
        .select("user_id, zalo_name").gt(col, 0)
        .order(col, { ascending: false }).limit(3);
      topPlayers = data || [];
    }

    if (type === "game") {
      const gameConfig = config.games?.[game_key];
      if (!gameConfig?.enabled) return res.status(400).json({ success: false, error: "Game không được bật" });
      rewards = gameConfig.rewards || [];

      if (game_key === "chess-wins") {
        const { data } = await supabase.from("chess_stats")
          .select("user_id, wins, losses, draws, total_games")
          .gt("wins", 0)
          .order("wins", { ascending: false })
          .order("total_games", { ascending: false })
          .limit(3);
        topPlayers = data || [];
      } else if (game_key === "chess-streak") {
        const { data } = await supabase.from("chess_stats")
          .select("user_id, best_streak, current_streak, wins, total_games")
          .gt("best_streak", 0)
          .order("best_streak", { ascending: false })
          .order("wins", { ascending: false })
          .limit(3);
        topPlayers = data || [];
      } else {
        const { data } = await supabase.from("game_scores")
          .select("user_id, player_name, score").eq("game_key", game_key)
          .order("score", { ascending: false }).limit(3);
        topPlayers = data || [];
      }
    }

    // Phát thưởng
    const results = [];
    for (let i = 0; i < Math.min(rewards.length, topPlayers.length); i++) {
      const player = topPlayers[i];
      const reward = rewards[i];
      if (!reward?.points || reward.points <= 0) continue;

      await addPoints({
        user_id: player.user_id,
        phone:   player.user_id,
        points:  reward.points,
        reason:  `Phần thưởng top ${reward.rank} bảng xếp hạng ${type === "game" ? game_key : period}`,
      });

      // Lưu lịch sử phát thưởng
      await supabase.from("notifications").insert({
        user_id: player.user_id,
        type:    "reward",
        title:   `🏆 Phần thưởng Top ${reward.rank}!`,
        message: `Bạn đạt Top ${reward.rank} bảng xếp hạng và nhận được ${reward.points} điểm thưởng!`,
        data:    { type, period, game_key, rank: reward.rank, points: reward.points },
        read:    false,
      });

      results.push({ rank: reward.rank, user_id: player.user_id,
        name: player.zalo_name || player.player_name, points: reward.points });
    }

    res.json({ success: true, message: `Đã phát thưởng cho ${results.length} người`, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/leaderboard/reset-game-scores
// Reset bảng xếp hạng game theo tuần
router.post("/reset-game-scores", requireAdmin, async (req, res) => {
  try {
    const { game_key } = req.body;

    if (game_key === "chess-wins" || game_key === "chess-streak") {
      return res.status(400).json({
        success: false,
        error: "BXH cờ vua là all-time theo thống kê thắng/chuỗi thắng, không reset bằng game_scores.",
      });
    }

    const weekStart = getMonday();

    // Backup weekly top 100 before reset.
    // Keep archive scope aligned with reset scope.
    const { data: top100 } = await supabase.from("game_scores")
      .select("*")
      .eq("game_key", game_key)
      .gte("played_at", weekStart)
      .order("score", { ascending: false })
      .limit(100);

    // Lưu backup
    await supabase.from("game_score_archives").insert({
      game_key,
      week_start: weekStart,
      top_scores: top100 || [],
      archived_at: new Date().toISOString(),
    }).catch(() => {}); // ignore nếu chưa có bảng

    // Reset weekly scores only.
    // game_scores is append-friendly and shared by game_key.
    // Deleting all rows would destroy alltime leaderboard history.

    const { error } = await supabase.from("game_scores")
      .delete()
      .eq("game_key", game_key)
      .gte("played_at", weekStart);

    if (error) throw error;
    res.json({
      success: true,
      message: `Đã reset BXH tuần ${game_key}`,
      archived: top100?.length || 0,
      week_start: weekStart,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function getMonday() {
  const vnNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const daysBack = (vnNow.getDay() + 6) % 7;
  const mondayVN = new Date(vnNow);
  mondayVN.setDate(vnNow.getDate() - daysBack);
  mondayVN.setHours(0, 0, 0, 0);
  return new Date(mondayVN.getTime() - 7 * 60 * 60 * 1000).toISOString();
}


// GET /admin/leaderboard/alltime-games-config
router.get("/alltime-games-config", requireAdmin, async (req, res) => {
  try {
    const { data } = await supabase.from("app_configs")
      .select("alltime_games_config").eq("id", 1).single();
    const defaultConfig = {
      enabled: true,
      games: {
        "black-pearl-rush": {
          enabled: true,
          display_name: "Bay cùng trân châu",
          icon: "🫧",
          rewards: [
            { rank:1, points:500, label:"🥇 Vô địch" },
            { rank:2, points:300, label:"🥈 Á quân" },
            { rank:3, points:200, label:"🥉 Hạng ba" },
          ]
        },
        "cing-stack-tower": {
          enabled: true,
          display_name: "Xếp Tháp Cing",
          icon: "🧱",
          rewards: [
            { rank:1, points:500, label:"🥇 Vô địch" },
            { rank:2, points:300, label:"🥈 Á quân" },
            { rank:3, points:200, label:"🥉 Hạng ba" },
          ]
        },
      }
    };
    res.json({ success:true, data: data?.alltime_games_config || defaultConfig });
  } catch(err) {
    res.status(500).json({ success:false, error:err.message });
  }
});

// PUT /admin/leaderboard/alltime-games-config
router.put("/alltime-games-config", requireAdmin, async (req, res) => {
  try {
    const { config } = req.body;
    const { error } = await supabase.from("app_configs")
      .update({ alltime_games_config: config }).eq("id", 1);
    if (error) throw error;
    res.json({ success:true, message:"Đã lưu cấu hình alltime games" });
  } catch(err) {
    res.status(500).json({ success:false, error:err.message });
  }
});

// GET /admin/leaderboard/alltime-games - lấy data alltime tất cả game đang bật
router.get("/alltime-games", requireAdmin, async (req, res) => {
  try {
    const { data: cfgRow } = await supabase.from("app_configs")
      .select("alltime_games_config").eq("id", 1).single();
    const cfg = cfgRow?.alltime_games_config || {};
    if (!cfg.enabled) return res.json({ success:true, data:[] });

    const enabledGames = Object.entries(cfg.games||{})
      .filter(([,v]) => v.enabled)
      .map(([k,v]) => ({ key:k, ...v }));

    const results = await Promise.all(enabledGames.map(async (game) => {
      if (game.key === "chess-wins" || game.key === "chess-streak") {
        const orderCol = game.key === "chess-wins" ? "wins" : "best_streak";
        const { data: stats } = await supabase
          .from("chess_stats")
          .select("user_id,wins,losses,draws,total_games,best_streak,current_streak")
          .gt(orderCol, 0)
          .order(orderCol, { ascending:false })
          .order("wins", { ascending:false })
          .limit(100);

        const userIds = (stats || []).map(s => String(s.user_id));
        const { data: players } = userIds.length
          ? await supabase.from("players").select("user_id,display_name,zalo_name,avatar").in("user_id", userIds)
          : { data: [] };
        const pMap = new Map((players||[]).map(p=>[String(p.user_id),p]));

        const top100 = (stats || []).map((s, i) => {
          const p = pMap.get(String(s.user_id));
          const winRate = Number(s.total_games || 0) > 0
            ? Number(((Number(s.wins || 0) / Number(s.total_games || 0)) * 100).toFixed(1))
            : 0;

          return {
            rank: i + 1,
            user_id: s.user_id,
            player_name: p?.display_name || p?.zalo_name || "Cing iu",
            avatar: p?.avatar || "",
            score: game.key === "chess-wins" ? Number(s.wins || 0) : Number(s.best_streak || 0),
            score_label: game.key === "chess-wins" ? "trận thắng" : "chuỗi thắng",
            wins: Number(s.wins || 0),
            losses: Number(s.losses || 0),
            draws: Number(s.draws || 0),
            total_games: Number(s.total_games || 0),
            win_rate: winRate,
            best_streak: Number(s.best_streak || 0),
            current_streak: Number(s.current_streak || 0),
          };
        });

        return { game_key:game.key, display_name:game.display_name,
          icon:game.icon, rewards:game.rewards, data:top100 };
      }

      const { data: scores } = await supabase
        .from("game_scores")
        .select("user_id, player_name, avatar, score, kills, played_at")
        .eq("game_key", game.key)
        .order("score", { ascending:false })
        .limit(2000);

      const bestMap = new Map();
      for (const s of (scores||[])) {
        const uid = String(s.user_id);
        if (!bestMap.has(uid) || s.score > bestMap.get(uid).score) bestMap.set(uid, s);
      }

      const userIds = [...bestMap.keys()].slice(0,200);
      const { data: players } = await supabase
        .from("players").select("user_id,display_name,zalo_name,avatar").in("user_id", userIds);
      const pMap = new Map((players||[]).map(p=>[String(p.user_id),p]));

      const top100 = [...bestMap.values()]
        .sort((a,b)=>b.score-a.score).slice(0,100)
        .map((s,i) => {
          const p = pMap.get(String(s.user_id));
          return { rank:i+1, user_id:s.user_id,
            player_name: p?.display_name||p?.zalo_name||s.player_name||"Cing iu",
            avatar: p?.avatar||s.avatar||"",
            score: s.score, score_label:"điểm", kills: s.kills||0 };
        });

      return { game_key:game.key, display_name:game.display_name,
        icon:game.icon, rewards:game.rewards, data:top100 };
    }));

    res.json({ success:true, data:results });
  } catch(err) {
    res.status(500).json({ success:false, error:err.message });
  }
});


// POST /admin/leaderboard/manual-weekly-reset - trigger thủ công
router.post("/manual-weekly-reset", requireAdmin, async (req, res) => {
  try {
    const { manualWeeklyReset } = require('../services/leaderboardResetService');
    // Reset last_weekly_reset để force chạy lại
    await require('../supabase').from('app_configs')
      .update({ last_weekly_reset: null }).eq('id', 1);
    res.json({ success:true, message:"Reset started..." });
    // Chạy async
    const io = req.app.get('io');
    manualWeeklyReset(io).then(r => console.log('[RESET] Manual done:', r));
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
});

// POST /admin/leaderboard/manual-monthly-reset
router.post("/manual-monthly-reset", requireAdmin, async (req, res) => {
  try {
    const { manualMonthlyReset } = require('../services/leaderboardResetService');
    const result = await manualMonthlyReset(global._ioInstance);
    res.json({ success: true, message: "Reset tháng hoàn tất", result });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
