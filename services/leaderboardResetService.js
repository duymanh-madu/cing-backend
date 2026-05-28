const supabase = require('../supabase');
const { addPoints } = require('./loyaltyPointService');

/**
 * Kiểm tra xem có cần reset không (mỗi thứ 2 00:00 VN)
 * Chạy mỗi phút, tự detect khi đến giờ
 */
function scheduleWeeklyReset(io) {
  // Chạy check mỗi phút
  setInterval(() => checkAndReset(io), 60 * 1000);
  console.log('[RESET] Weekly reset scheduler started');
}

async function checkAndReset(io) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  // Thứ 2 (1) lúc 00:00-00:01
  if (now.getDay() !== 1) return;
  if (now.getHours() !== 0) return;
  if (now.getMinutes() > 1) return;

  // Kiểm tra đã reset tuần này chưa
  const { data: cfg } = await supabase.from('app_configs')
    .select('last_weekly_reset').eq('id', 1).single();
  
  const lastReset = cfg?.last_weekly_reset ? new Date(cfg.last_weekly_reset) : null;
  const mondayStart = new Date(now); mondayStart.setHours(0,0,0,0);
  
  if (lastReset && lastReset >= mondayStart) return; // Đã reset rồi

  console.log('[RESET] Starting weekly leaderboard reset...');
  await doWeeklyReset(io);
}

async function doWeeklyReset(io) {
  try {
    const { data: configRow } = await supabase.from('app_configs')
      .select('leaderboard_config').eq('id', 1).single();
    const config = configRow?.leaderboard_config || {};

    const messages = [];

    // 1. Reset + phát thưởng BXH game tuần
    const games = config.games || {};
    for (const [gameKey, gameCfg] of Object.entries(games)) {
      if (!gameCfg.enabled || !gameCfg.weekly_reset) continue;

      // Lấy top 3 tuần này
      const monday = getLastMonday();
      const { data: scores } = await supabase
        .from('game_scores')
        .select('user_id, player_name, score')
        .eq('game_key', gameKey)
        .gte('played_at', monday)
        .order('score', { ascending: false })
        .limit(500);

      // Best per user
      const bestMap = new Map();
      for (const s of (scores||[])) {
        const uid = String(s.user_id);
        if (!bestMap.has(uid) || s.score > bestMap.get(uid).score) bestMap.set(uid, s);
      }
      const top3 = [...bestMap.values()].sort((a,b)=>b.score-a.score).slice(0,3);

      // Phát thưởng
      for (let i = 0; i < Math.min(top3.length, (gameCfg.rewards||[]).length); i++) {
        const reward = gameCfg.rewards[i];
        const player = top3[i];
        if (!reward?.points || !player?.user_id) continue;
        try {
          await addPoints({
            phone: player.user_id, user_id: player.user_id,
            points: reward.points,
            reason: `🏆 ${reward.label || `Top ${i+1}`} BXH ${gameCfg.display_name || gameKey} tuần`,
          });
          console.log(`[RESET] Rewarded ${player.player_name}: +${reward.points}đ`);
        } catch(e) { console.warn('[RESET] Reward failed:', e.message); }
      }

      if (top3.length > 0) {
        messages.push(`🎮 ${gameCfg.display_name||gameKey}: 🥇${top3[0]?.player_name||'?'} 🥈${top3[1]?.player_name||'?'} 🥉${top3[2]?.player_name||'?'}`);
      }
    }

    // 2. Reset + phát thưởng BXH chi tiêu tuần
    const weeklySpend = config.spending?.weekly;
    if (weeklySpend?.enabled && weeklySpend?.rewards?.length > 0) {
      const { data: spenders } = await supabase
        .from('players')
        .select('user_id, zalo_name, crm_spend_weekly')
        .gt('crm_spend_weekly', 0)
        .order('crm_spend_weekly', { ascending: false })
        .limit(10);

      const top3 = (spenders||[]).slice(0,3);
      for (let i = 0; i < Math.min(top3.length, weeklySpend.rewards.length); i++) {
        const reward = weeklySpend.rewards[i];
        const player = top3[i];
        if (!reward?.points || !player?.user_id) continue;
        try {
          await addPoints({
            phone: player.user_id, user_id: player.user_id,
            points: reward.points,
            reason: `💰 ${reward.label||`Top ${i+1}`} BXH chi tiêu tuần`,
          });
        } catch(e) { console.warn('[RESET] Spend reward failed:', e.message); }
      }
      if (top3.length > 0) {
        messages.push(`💰 Chi tiêu tuần: 🥇${top3[0]?.zalo_name||'?'} 🥈${top3[1]?.zalo_name||'?'} 🥉${top3[2]?.zalo_name||'?'}`);
      }
    }

    // 2b. Reset crm_spend_weekly về 0 cho tất cả players
    try {
      await supabase.from('players').update({ crm_spend_weekly: 0 }).gt('crm_spend_weekly', 0);
      console.log('[RESET] crm_spend_weekly reset to 0');
    } catch(e) { console.warn('[RESET] Reset weekly failed:', e.message); }

    // 3. Lưu last_weekly_reset
    await supabase.from('app_configs')
      .update({ last_weekly_reset: new Date().toISOString() }).eq('id', 1);

    // 4. Broadcast thông báo toàn server
    if (io && messages.length > 0) {
      const msg = `🔄 BXH tuần đã được làm mới!\n${messages.join('\n')}\n\nMời top 3 vào nhận thưởng! 🎁`;
      io.emit('leaderboard.weekly_reset', { message: msg, timestamp: new Date().toISOString() });
      io.emit('notification', { type:'leaderboard_reset', message: msg });
      console.log('[RESET] Broadcasted:', msg);
    }

    console.log('[RESET] Weekly reset completed!');
    return { success: true, messages };
  } catch(e) {
    console.error('[RESET] Error:', e.message);
    return { success: false, error: e.message };
  }
}

function getLastMonday() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay()+6)%7));
  monday.setHours(0,0,0,0);
  return monday.toISOString();
}

// Manual trigger cho admin
async function manualWeeklyReset(io) {
  console.log('[RESET] Manual trigger...');
  return doWeeklyReset(io);
}

module.exports = { scheduleWeeklyReset, manualWeeklyReset, doWeeklyReset };
