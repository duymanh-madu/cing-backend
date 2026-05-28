const express  = require('express');
const router   = express.Router();
const supabase = require('../supabase');

// GET /game/chess/leaderboard - BXH 2 phần
router.get('/leaderboard', async (req, res) => {
  try {
    // Top 100 thắng nhiều nhất
    const { data: topWins } = await supabase
      .from('chess_stats')
      .select('user_id, wins, losses, draws, total_games')
      .order('wins', { ascending: false })
      .limit(100);

    // Top 100 chuỗi thắng dài nhất
    const { data: topStreak } = await supabase
      .from('chess_stats')
      .select('user_id, best_streak, current_streak, wins, total_games')
      .order('best_streak', { ascending: false })
      .limit(100);

    // Lấy tên + avatar từ players
    const allIds = [...new Set([
      ...(topWins||[]).map(p=>p.user_id),
      ...(topStreak||[]).map(p=>p.user_id),
    ])];

    const { data: players } = await supabase
      .from('players')
      .select('user_id, zalo_name, avatar')
      .in('user_id', allIds);

    const pMap = new Map((players||[]).map(p=>[p.user_id, p]));

    const enrichWins = (topWins||[]).map((s,i) => {
      const p = pMap.get(s.user_id);
      return { rank:i+1, user_id:s.user_id,
        name: p?.zalo_name || s.user_id,
        avatar: p?.avatar || '',
        wins: s.wins, losses: s.losses,
        draws: s.draws, total_games: s.total_games,
        winRate: s.total_games > 0 ? Math.round(s.wins/s.total_games*100) : 0,
      };
    });

    const enrichStreak = (topStreak||[]).map((s,i) => {
      const p = pMap.get(s.user_id);
      return { rank:i+1, user_id:s.user_id,
        name: p?.zalo_name || s.user_id,
        avatar: p?.avatar || '',
        best_streak: s.best_streak,
        current_streak: s.current_streak,
        wins: s.wins, total_games: s.total_games,
      };
    });

    res.json({ success:true, data: { topWins: enrichWins, topStreak: enrichStreak } });
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
});


// POST /game/chess/game-ended - được gọi từ game server sau khi ván kết thúc
router.post('/game-ended', async (req, res) => {
  res.json({ ok: true });
  // Check top1 async
  try {
    const { checkAndNotifyTop1Changes } = require('../services/leaderboardResetService');
    const io = global._ioInstance;
    await checkAndNotifyTop1Changes(io);
  } catch(e) { console.warn('[TOP1] Chess game-ended check:', e.message); }
});

module.exports = router;
