const supabase = require('../supabase');
const { addPoints } = require('./loyaltyPointService');

/**
 * Kiểm tra xem có cần reset không (mỗi thứ 2 00:00 VN)
 * Chạy mỗi phút, tự detect khi đến giờ
 */
function scheduleWeeklyReset(io) {
  // Chạy check mỗi phút
  setInterval(() => checkAndReset(io), 60 * 1000);
  setInterval(() => checkAndResetMonthly(io), 60 * 1000);
  setInterval(() => checkAndResetYearly(io), 60 * 1000);
  console.log('[RESET] Weekly/Monthly/Yearly reset schedulers started');
}

// Reset tháng — ngày 1 hàng tháng 00:00 VN
async function checkAndResetMonthly(io) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  if (now.getDate() !== 1) return;
  if (now.getHours() !== 0) return;
  if (now.getMinutes() > 1) return;

  const { data: cfg } = await supabase.from('app_configs')
    .select('last_monthly_reset').eq('id', 1).single();
  const lastReset = cfg?.last_monthly_reset ? new Date(cfg.last_monthly_reset) : null;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (lastReset && lastReset >= monthStart) return;

  console.log('[RESET] Starting monthly leaderboard reset...');
  try {
    // Lấy top 3 chi tiêu tháng
    const { data: cfg2 } = await supabase.from('app_configs').select('leaderboard_config').eq('id', 1).single();
    const monthlyRewards = cfg2?.leaderboard_config?.spending?.monthly?.rewards || [];
    const { data: spenders } = await supabase.from('players')
      .select('user_id, zalo_name, crm_spend_monthly')
      .gt('crm_spend_monthly', 0)
      .order('crm_spend_monthly', { ascending: false }).limit(3);

    const top3 = spenders || [];
    for (let i = 0; i < Math.min(top3.length, monthlyRewards.length); i++) {
      const reward = monthlyRewards[i];
      const player = top3[i];
      if (!reward?.points || !player?.user_id) continue;
      await supabase.from('pending_rewards').insert({
        user_id: player.user_id, player_name: player.zalo_name,
        points: reward.points, reason: `🏆 ${reward.label||`Top ${i+1}`} BXH chi tiêu tháng`,
        rank: i+1, board: 'Chi tiêu tháng', claimed: false, created_at: new Date().toISOString(),
      }).catch(()=>{});
    }

    // Reset crm_spend_monthly
    await supabase.from('players').update({ crm_spend_monthly: 0 }).gt('crm_spend_monthly', 0);
    await supabase.from('app_configs').update({ last_monthly_reset: new Date().toISOString() }).eq('id', 1);

    const names = top3.slice(0,3).map((p,i)=>['🥇','🥈','🥉'][i]+' '+p.zalo_name).join(' ');
    const msg = `🎁 BXH chi tiêu tháng đã reset! ${names}
Mời top 3 vào nhận thưởng! 🏆`;
    if (io) { io.emit('leaderboard.monthly_reset', { message: msg }); io.emit('notification', { type:'monthly_reset', message: msg }); }
    console.log('[RESET] Monthly reset done:', msg);
  } catch(e) { console.error('[RESET] Monthly error:', e.message); }
}

// Reset năm — ngày 1/1 00:00 VN
async function checkAndResetYearly(io) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  if (now.getDate() !== 1 || now.getMonth() !== 0) return;
  if (now.getHours() !== 0) return;
  if (now.getMinutes() > 1) return;

  const { data: cfg } = await supabase.from('app_configs')
    .select('last_yearly_reset').eq('id', 1).single();
  const lastReset = cfg?.last_yearly_reset ? new Date(cfg.last_yearly_reset) : null;
  const yearStart = new Date(now.getFullYear(), 0, 1);
  if (lastReset && lastReset >= yearStart) return;

  console.log('[RESET] Starting yearly leaderboard reset...');
  try {
    const { data: cfg2 } = await supabase.from('app_configs').select('leaderboard_config').eq('id', 1).single();
    const yearlyRewards = cfg2?.leaderboard_config?.spending?.yearly?.rewards || [];
    const { data: spenders } = await supabase.from('players')
      .select('user_id, zalo_name, crm_spend_yearly')
      .gt('crm_spend_yearly', 0)
      .order('crm_spend_yearly', { ascending: false }).limit(3);

    const top3 = spenders || [];
    for (let i = 0; i < Math.min(top3.length, yearlyRewards.length); i++) {
      const reward = yearlyRewards[i];
      const player = top3[i];
      if (!reward?.points || !player?.user_id) continue;
      await supabase.from('pending_rewards').insert({
        user_id: player.user_id, player_name: player.zalo_name,
        points: reward.points, reason: `🏆 ${reward.label||`Top ${i+1}`} BXH chi tiêu năm`,
        rank: i+1, board: 'Chi tiêu năm', claimed: false, created_at: new Date().toISOString(),
      }).catch(()=>{});
    }

    // Reset crm_spend_yearly về 0
    await supabase.from('players').update({ crm_spend_yearly: 0 }).gt('crm_spend_yearly', 0);
    await supabase.from('app_configs').update({ last_yearly_reset: new Date().toISOString() }).eq('id', 1);
    const names = top3.slice(0,3).map((p,i)=>['🥇','🥈','🥉'][i]+' '+p.zalo_name).join(' ');
    const msg = `🎁 BXH chi tiêu năm đã reset! ${names}
Mời top 3 vào nhận thưởng! 🏆`;
    if (io) { io.emit('leaderboard.yearly_reset', { message: msg }); }
    console.log('[RESET] Yearly reset done');
  } catch(e) { console.error('[RESET] Yearly error:', e.message); }
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
  // Monday 00:00 VN time
  const vnNow2 = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const mondayStart = new Date(new Date(vnNow2.setDate(vnNow2.getDate() - (vnNow2.getDay()+6)%7)).setHours(0,0,0,0) - 7*3600000);
  
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

      // Lưu pending_rewards thay vì cộng thẳng
      for (let i = 0; i < Math.min(top3.length, (gameCfg.rewards||[]).length); i++) {
        const reward = gameCfg.rewards[i];
        const player = top3[i];
        if (!reward?.points || !player?.user_id) continue;
        try {
          await supabase.from('pending_rewards').insert({
            user_id: player.user_id,
            player_name: player.player_name,
            points: reward.points,
            reason: `🏆 ${reward.label || `Top ${i+1}`} BXH ${gameCfg.display_name || gameKey} tuần`,
            rank: i + 1,
            board: gameCfg.display_name || gameKey,
            claimed: false,
            created_at: new Date().toISOString(),
          });
          console.log(`[RESET] Pending reward saved: ${player.player_name} +${reward.points}đ`);
        } catch(e) { console.warn('[RESET] Pending reward failed:', e.message); }
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
          await supabase.from('pending_rewards').insert({
            user_id: player.user_id,
            player_name: player.zalo_name,
            points: reward.points,
            reason: `💰 ${reward.label||`Top ${i+1}`} BXH chi tiêu tuần`,
            rank: i + 1,
            board: 'Chi tiêu tuần',
            claimed: false,
            created_at: new Date().toISOString(),
          });
        } catch(e) { console.warn('[RESET] Spend pending reward failed:', e.message); }
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
      const msg = `🎁 Bảng xếp hạng tuần đã được reset và phát quà cho top 3!\n${messages.join('\n')}\n\nMời các bạn lọt top 3 vào nhận thưởng! 🏆`;
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
  // Monday 00:00 VN time (UTC+7) → UTC
  const vnNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const daysBack = (vnNow.getDay() + 6) % 7;
  const mondayVN = new Date(vnNow);
  mondayVN.setDate(vnNow.getDate() - daysBack);
  mondayVN.setHours(0, 0, 0, 0);
  return new Date(mondayVN.getTime() - 7 * 60 * 60 * 1000).toISOString();
}

// Manual trigger cho admin
async function manualWeeklyReset(io) {
  console.log('[RESET] Manual trigger...');
  return doWeeklyReset(io);
}


/**
 * Check và notify khi có top 1 mới ở bất kỳ BXH nào
 */
async function checkAndNotifyTop1Changes(io) {
  try {
    const { data: cfg } = await supabase.from('app_configs')
      .select('leaderboard_config, top1_cache').eq('id', 1).single();
    const lbCfg = cfg?.leaderboard_config || {};
    const cache = cfg?.top1_cache || {};
    const newCache = { ...cache };
    const notifications = [];

    // Check BXH tiêu dùng tuần
    if (lbCfg.spending?.weekly?.enabled) {
      const { data } = await supabase.from('players')
        .select('user_id, zalo_name').gt('crm_spend_weekly', 0)
        .order('crm_spend_weekly', { ascending: false }).limit(1).single();
      if (data && cache.weekly_top1 !== data.user_id) {
        newCache.weekly_top1 = data.user_id;
        notifications.push({ name: data.zalo_name||data.user_id, board: 'BXH Chi tiêu tuần' });
      }
    }

    // Check BXH tiêu dùng tháng
    if (lbCfg.spending?.monthly?.enabled) {
      const { data } = await supabase.from('players')
        .select('user_id, zalo_name').gt('crm_spend_monthly', 0)
        .order('crm_spend_monthly', { ascending: false }).limit(1).single();
      if (data && cache.monthly_top1 !== data.user_id) {
        newCache.monthly_top1 = data.user_id;
        notifications.push({ name: data.zalo_name||data.user_id, board: 'BXH Chi tiêu tháng' });
      }
    }

    // Check BXH chess - thắng nhiều nhất
    const { data: chessTop } = await supabase.from('chess_stats')
      .select('user_id').order('wins', { ascending: false }).limit(1).single();
    if (chessTop) {
      const { data: p } = await supabase.from('players')
        .select('zalo_name').eq('user_id', chessTop.user_id).single();
      if (cache.chess_top1 !== chessTop.user_id) {
        newCache.chess_top1 = chessTop.user_id;
        notifications.push({ name: p?.zalo_name||chessTop.user_id, board: 'BXH Kỳ thủ cờ vua' });
      }
    }

    // Check BXH game scores
    const games = Object.entries(lbCfg.games||{}).filter(([,v])=>v.enabled);
    for (const [gameKey, gameCfg] of games) {
      const { data: scores } = await supabase.from('game_scores')
        .select('user_id, player_name, score').eq('game_key', gameKey)
        .order('score', { ascending: false }).limit(1).single();
      if (scores) {
        const cacheKey = `game_${gameKey}_top1`;
        if (cache[cacheKey] !== scores.user_id) {
          newCache[cacheKey] = scores.user_id;
          notifications.push({ name: scores.player_name||scores.user_id, board: gameCfg.display_name||gameKey });
        }
      }
    }

    // Update cache
    if (Object.keys(newCache).length) {
      await supabase.from('app_configs').update({ top1_cache: newCache }).eq('id', 1);
    }

    // Broadcast notifications
    for (const notif of notifications) {
      const msg = `🏆 Chúc mừng ${notif.name} đã xuất sắc leo lên Top 1 ${notif.board}!`;
      console.log('[TOP1]', msg);
      if (io) {
        io.emit('notification.broadcast', {
          notification: {
            title: '🏆 Top 1 mới!',
            message: msg,
            type: 'leaderboard',
            created_at: new Date().toISOString(),
          }
        });
      }
    }
  } catch(e) { console.warn('[TOP1] Error:', e.message); }
}

module.exports = { scheduleWeeklyReset, manualWeeklyReset, doWeeklyReset, checkAndNotifyTop1Changes };
