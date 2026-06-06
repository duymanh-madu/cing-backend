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

  const { winner_id, winner } = req.body || {};
  const winnerId = winner_id || winner;

  if (winnerId) {
    try {
      const { data: stats } = await supabase
        .from('chess_stats').select('wins').eq('user_id', winnerId).maybeSingle();
      const wins = stats?.wins || 0;
      console.log(`[CHESS] game-ended winner=${winnerId} wins=${wins}`);

      const { awardPlays, getMissionConfigs } = require('../services/dailyMissionService');
      const configs = await getMissionConfigs();
      const winCfg = configs.find(c => c.condition_type === 'manual' && c.type === 'win');

      if (winCfg && wins >= 5) {
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
        const { data: existing } = await supabase.from('daily_missions')
          .select('id').eq('user_id', winnerId).eq('mission_date', today)
          .eq('mission_type', 'win').eq('completed', true).maybeSingle();

        if (!existing) {
          await supabase.from('daily_missions').upsert({
            user_id: winnerId, mission_date: today, mission_type: 'win',
            completed: true, plays_awarded: winCfg.plays,
            completed_at: new Date().toISOString(),
          }, { onConflict: 'user_id,mission_date,mission_type' });
          await awardPlays(winnerId, winCfg.plays);
          console.log(`[CHESS] Win mission awarded: ${winnerId} +${winCfg.plays} plays`);
        }
      }
    } catch(e) { console.warn('[CHESS] Win mission check failed:', e.message); }
  }

  // Check top1 async
  try {
    const { checkAndNotifyTop1Changes } = require('../services/leaderboardResetService');
    const io = global._ioInstance;
    await checkAndNotifyTop1Changes(io);
  } catch(e) { console.warn('[TOP1] Chess game-ended check:', e.message); }
});

// POST /api/chess/tip — tặng vật phẩm trong ván cờ
router.post('/tip', async (req, res) => {
  res.json({ success: true });
  try {
    const { fromUserId, toUserId, amount, charm, giftId, giftName, giftIcon } = req.body;
    if (!fromUserId || !toUserId || !amount) return;

    const validAmounts = [5, 10, 20, 50, 100];
    if (!validAmounts.includes(Number(amount))) return;

    // Kiểm tra đủ điểm
    const { data: player } = await supabase.from('players')
      .select('total_points').eq('user_id', fromUserId).single();
    const currentPoints = Number(player?.total_points || 0);
    if (currentPoints < Number(amount)) {
      console.warn(`[CHESS GIFT] ${fromUserId} không đủ điểm: có ${currentPoints}, cần ${amount}`);
      return;
    }

    const { deductPoints } = require('../services/loyaltyPointService');

    // Trừ điểm tích lũy người tặng
    await deductPoints({
      phone: fromUserId, user_id: fromUserId,
      points: Number(amount),
      reason: `Tặng ${giftName || "vật phẩm"} cho ${toUserId} trong ván cờ`,
    });

    // Cộng charm points người nhận — simple increment
    const charmAmount = Number(charm || amount);
    const { data: rec } = await supabase.from('players')
      .select('charm_points').eq('user_id', toUserId).maybeSingle();
    const newCharm = Number(rec?.charm_points || 0) + charmAmount;
    await supabase.from('players').update({ charm_points: newCharm }).eq('user_id', toUserId);

    // Lấy tên người tặng
    const { data: fromPlayer } = await supabase.from('players')
      .select('zalo_name').eq('user_id', fromUserId).maybeSingle();
    const fromName = fromPlayer?.zalo_name || fromUserId;

    // Lưu notification vào DB để người nhận offline vẫn thấy
    const { error: notifErr } = await supabase.from('notifications').insert({
      user_id: toUserId,
      type: 'gift_received',
      title: `${fromName} đã tặng bạn ${giftIcon || ""} ${giftName || "vật phẩm"}`,
      message: `+${charmAmount} điểm quyến rũ`,
      metadata: { fromUserId, fromName, giftId, giftName, giftIcon, charm: charmAmount },
      is_read: false,
    });
    if (notifErr) console.warn('[GIFT NOTIF ERROR]', notifErr.message);
    else console.log('[GIFT NOTIF] Saved for', toUserId);

    // Socket realtime nếu người nhận đang online
    const io = global._ioInstance;
    if (io) {
      io.emit("chess:tip_received", {
        fromUserId, toUserId, amount: Number(amount),
        charm: charmAmount, giftId, giftName, giftIcon, fromName,
      });
      // Push notification realtime
      io.emit("notification:new", {
        userId: toUserId,
        title: `${fromName} đã tặng bạn ${giftIcon || ""} ${giftName}`,
        body: `+${charmAmount} điểm quyến rũ`,
        type: 'gift_received',
      });
    }

    console.log(`[CHESS GIFT] ${fromUserId} → ${toUserId}: ${giftName} (+${charmAmount} charm) newCharm=${newCharm}`);
  } catch(e) {
    console.warn('[CHESS GIFT] Error:', e.message);
  }
});

module.exports = router;
