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

// POST /api/chess/tip — tặng điểm trong ván cờ
router.post('/tip', async (req, res) => {
  res.json({ success: true }); // Trả lời ngay
  try {
    const { fromUserId, toUserId, amount } = req.body;
    if (!fromUserId || !toUserId || !amount) return;
    
    const validAmounts = [5, 10, 20, 50, 100];
    if (!validAmounts.includes(Number(amount))) return;
    
    // Kiểm tra điểm trước khi trừ
    const { data: player } = await supabase
      .from('players')
      .select('total_points')
      .eq('user_id', fromUserId)
      .single();
    
    const currentPoints = Number(player?.total_points || 0);
    if (currentPoints < Number(amount)) {
      console.warn(`[CHESS TIP] ${fromUserId} không đủ điểm: có ${currentPoints}, cần ${amount}`);
      return;
    }
    
    const { deductPoints, addPoints } = require('../services/loyaltyPointService');
    
    // Trừ điểm người tặng
    await deductPoints({
      phone: fromUserId, user_id: fromUserId,
      points: Number(amount),
      reason: `Tặng điểm trong ván cờ cho ${toUserId}`,
    });
    
    // Cộng điểm người nhận
    await addPoints({
      phone: toUserId, user_id: toUserId,
      points: Number(amount),
      reason: `Nhận điểm tặng trong ván cờ từ ${fromUserId}`,
    });
    
    console.log(`[CHESS TIP] ${fromUserId} → ${toUserId}: ${amount} điểm`);
  } catch(e) {
    console.warn('[CHESS TIP] Error:', e.message);
  }
});

module.exports = router;
