const supabase = require('../../supabase');
const foodbook = require('../foodbook');
const { addPlays } = require('../loyaltyPointService');

/**
 * Lấy thời điểm hiện tại theo giờ VN (UTC+7)
 * Trả về object Date đã được điều chỉnh
 */
function nowVN() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
}

/**
 * Format date thành string cho iPos API
 * iPos nhận format: "2026-01-01 00:00:00"
 */
function fmtIpos(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Tính period ranges theo giờ VN thật
 * Tất cả mốc thời gian đều tính theo Asia/Ho_Chi_Minh
 */
function getPeriodDates() {
  const now = nowVN();

  // Tuần: thứ 2 đầu tuần 00:00:00 VN
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay()+6) % 7));
  weekStart.setHours(0, 0, 0, 0);

  // Tháng: ngày 1 đầu tháng 00:00:00 VN
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);

  // Quý: ngày 1 đầu quý 00:00:00 VN
  const quarter      = Math.floor(now.getMonth() / 3);
  const quarterStart = new Date(now.getFullYear(), quarter * 3, 1, 0, 0, 0);

  // Năm: 01/01 00:00:00 VN
  const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0);

  const nowStr = fmtIpos(now);

  return {
    week:    { from: fmtIpos(weekStart),    to: nowStr },
    month:   { from: fmtIpos(monthStart),   to: nowStr },
    quarter: { from: fmtIpos(quarterStart), to: nowStr },
    year:    { from: fmtIpos(yearStart),    to: nowStr },
  };
}

async function fetchPeriodSpend(userId, from, to) {
  const result = await foodbook.getMembershipLog(userId, {
    create_from: from,
    create_to:   to,
    page_size:   500,
  });
  return result.data?.total_spent || 0;
}

function isPhoneId(userId) {
  return /^(0|84)\d{8,10}$/.test(String(userId));
}

function mapTierKey(name) {
  if (!name) return "member";
  const n = name.toLowerCase().trim();
  if (n.includes("đối tác thân thiết") || n.includes("doi tac than thiet") || n === "dttt") return "loyal_partner";
  if ((n.includes("đối tác") || n.includes("doi tac") || n === "dt") && !n.includes("thân thiết")) return "partner";
  if (n.includes("kim") && (n.includes("cuong") || n.includes("cương"))) return "diamond";
  if (n.includes("vàng") || n.includes("vang") || n.includes("gold")) return "gold";
  if (n.includes("bạc") || n.includes("bac") || n.includes("silver")) return "silver";
  if (n.includes("thân thiết") || n.includes("than thiet") || n.includes("loyal")) return "loyal";
  return "member";
}

async function syncOnePlayer(player) {
  const userId = player.user_id;
  if (!userId || !isPhoneId(userId)) return null;

  try {
    const memberResult = await foodbook.getMember(userId);
    const memberData   = memberResult?.data?.data || {};

    if (!memberData.phone_number) {
      console.log(`Skip ${userId}: not found in iPos`);
      return { user_id: userId, success: false, error: 'not in iPos' };
    }

    const allTimeSpent  = Number(memberData.payment_amount || 0);
    const allTimeOrders = Number(memberData.eat_times || 0);

    const periods = getPeriodDates();

    // Lấy custom period từ app_configs (row id=1, columns trực tiếp)
    let customFrom = null, customTo = null;
    try {
      const { data: cfg } = await supabase.from('app_configs')
        .select('custom_leaderboard_from, custom_leaderboard_to').eq('id', 1).single();
      customFrom = cfg?.custom_leaderboard_from || null;
      customTo   = cfg?.custom_leaderboard_to   || null;
    } catch(e) { console.warn('Custom config fetch failed:', e.message); }

    const [weekly, monthly, quarterly, yearly, custom] = await Promise.all([
      fetchPeriodSpend(userId, periods.week.from,    periods.week.to),
      fetchPeriodSpend(userId, periods.month.from,   periods.month.to),
      fetchPeriodSpend(userId, periods.quarter.from, periods.quarter.to),
      fetchPeriodSpend(userId, periods.year.from,    periods.year.to),
      customFrom ? fetchPeriodSpend(userId,
        customFrom + ' 00:00:00',
        (customTo || new Date().toISOString().slice(0,10)) + ' 23:59:59'
      ) : Promise.resolve(0),
    ]);

    // Lưu vào Supabase — timestamp dùng UTC chuẩn (Supabase tự xử lý)
    const { error } = await supabase
      .from('players')
      .upsert({
        user_id: userId,
        zalo_name: player.profile_changed_at ? player.zalo_name : (memberData.name || player.zalo_name || null),
        name: memberData.name || player.name || null,
        crm_tier:            (() => {
          const rawTier = mapTierKey(memberData.membership_type_name || "");
          if (rawTier === 'loyal_partner' && monthly < 2000000) return 'member';
          if (rawTier === 'partner' && monthly < 1000000) return 'member';
          return rawTier;
        })(),
        crm_spend_alltime:   allTimeSpent,
        crm_spend_weekly:    weekly,
        crm_spend_monthly:   monthly,
        crm_spend_quarterly: quarterly,
        crm_spend_yearly:    yearly,
        crm_spend_custom:    custom,
        crm_orders_alltime:  allTimeOrders,
        crm_synced_at:       new Date().toISOString(), // UTC — Supabase chuẩn
      }, { onConflict: 'user_id' });

    if (error) {
      console.error('Supabase error:', userId, error.message);
      return { user_id: userId, success: false };
    }

    // Lấy player hiện tại để tính lượt chơi
    const { data: currentPlayer } = await supabase
      .from('players')
      .select('game_plays, plays_from_spend, first_activated_at')
      .eq('user_id', userId)
      .single();

    const playsUpdate = {};

    // Logic 1: Lần đầu active -> tang 3 luot choi mien phi
    if (!currentPlayer?.first_activated_at && allTimeOrders > 0) {
      playsUpdate.first_activated_at = new Date().toISOString();
      playsUpdate.game_plays = Number(currentPlayer?.game_plays || 0) + 3;
      console.log('[GAME] First activation bonus: +3 plays for ' + userId);
      await addPlays({ user_id: userId, amount: 3, reason: 'Bonus kích hoạt lần đầu', new_total: playsUpdate.game_plays }).catch(()=>{});
    }

    // Logic 2: Moi 20.000d spending tich luy -> +1 luot choi
    // Tính lượt chơi từ crm_spend_custom (chi tiêu từ 01/06/2026)
    // Đọc tỉ lệ từ DB — admin có thể thay đổi qua dashboard
    let appCfg = null;
    try {
      const { data } = await supabase.from('app_configs')
        .select('spend_per_play').eq('id', 1).single();
      appCfg = data;
    } catch(e) {}
    const SPEND_PER_PLAY = appCfg?.spend_per_play || 20000;
    const spendSinceLaunch = custom || 0;
    const playsEarned = Math.floor(spendSinceLaunch / SPEND_PER_PLAY);
    const playsFromSpend = Number(currentPlayer?.plays_from_spend || 0);
    const newPlays       = playsEarned - playsFromSpend;

    if (newPlays > 0) {
      const currentPlays = Number(playsUpdate.game_plays != null ? playsUpdate.game_plays : (currentPlayer?.game_plays || 0));
      playsUpdate.game_plays       = currentPlays + newPlays;
      playsUpdate.plays_from_spend = playsEarned;
      console.log('[GAME] Spend bonus: +' + newPlays + ' plays for ' + userId + ' (total earned: ' + playsEarned + ')');
      await addPlays({ user_id: userId, amount: newPlays, reason: 'Thưởng ' + newPlays + ' lượt từ chi tiêu (' + Math.floor(spendSinceLaunch/1000) + 'k)', new_total: playsUpdate.game_plays }).catch(()=>{});
    }

    if (Object.keys(playsUpdate).length > 0) {
      await supabase.from('players').update(playsUpdate).eq('user_id', userId);
    }

    console.log(`Synced ${memberData.name||userId}: all=${allTimeSpent} week=${weekly} month=${monthly}`);

    // Publish Redis event để trigger top1 check ngay lập tức
    try {
      const redisPublisher = require('../infrastructure/cache/redisPublisher');
      await redisPublisher.publish('leaderboard:spending_updated', JSON.stringify({ userId, allTimeSpent, weekly, monthly }));
    } catch(e) {}

    return { user_id: userId, success: true, allTimeSpent, weekly, monthly, quarterly, yearly };

  } catch (err) {
    console.error('syncOnePlayer error:', userId, err.message);
    return { user_id: userId, success: false, error: err.message };
  }
}

async function syncAllPlayersCrmSpending({ batchSize=3, delayMs=2000 } = {}) {
  console.log('START CRM SYNC... VN time:', fmtIpos(nowVN()));
  const t0 = Date.now();

  // Supabase default limit 1000 — phải dùng pagination để lấy hết
  let players = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data: page, error: pageErr } = await supabase
      .from('players')
      .select('user_id, zalo_name')
      .range(from, from + pageSize - 1);
    if (pageErr) { console.error('Fetch players error:', pageErr.message); break; }
    if (!page || page.length === 0) break;
    players = [...players, ...page];
    if (page.length < pageSize) break;
    from += pageSize;
  }
  const error = null;

  if (error) return { success: false, error: error.message };

  const filtered = players.filter(p => isPhoneId(p.user_id));
  console.log(`Players: ${players.length} total, ${filtered.length} with phone ID`);

  const stats = { success:0, failed:0, skipped:0 };

  for (let i = 0; i < filtered.length; i += batchSize) {
    const batch   = filtered.slice(i, i+batchSize);
    const results = await Promise.all(batch.map(p => syncOnePlayer(p)));
    results.forEach(r => {
      if (!r) stats.skipped++;
      else if (r.success) stats.success++;
      else stats.failed++;
    });
    if (i+batchSize < filtered.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  const elapsed = ((Date.now()-t0)/1000).toFixed(1);
  console.log(`SYNC DONE ${elapsed}s`, stats);
  // Check top1 thay đổi sau sync
  try {
    const { checkAndNotifyTop1Changes } = require('../leaderboardResetService');
    const io = global._ioInstance;
    await checkAndNotifyTop1Changes(io);
  } catch(e) { console.warn('[TOP1] CRM sync check failed:', e.message); }
  return { success: true, stats, elapsed_seconds: elapsed, total: filtered.length };
}

async function syncSingleUserSpending(userId) {
  const player = { user_id: String(userId) };
  return syncOnePlayer(player);
}

module.exports = {
  syncAllPlayersCrmSpending,
  syncSingleUserSpending,
  syncOnePlayer,
  getPeriodDates,
  fetchPeriodSpend,
  nowVN,
  fmtIpos,
};

/**
 * Sync custom range cho tất cả players
 * Gọi khi admin thay đổi custom_leaderboard_from/to
 */
async function syncCustomRangeSpending(from, to) {
  console.log(`SYNC CUSTOM RANGE: ${from} -> ${to}`);

  const { data: players, error } = await supabase
    .from('players')
    .select('user_id, zalo_name');

  if (error) return { success: false, error: error.message };

  const filtered = players.filter(p => isPhoneId(p.user_id));
  const stats = { success:0, failed:0, skipped:0 };

  for (let i = 0; i < filtered.length; i += 3) {
    const batch = filtered.slice(i, i+3);
    await Promise.all(batch.map(async p => {
      try {
        const spent = await fetchPeriodSpend(p.user_id, from, to);
        await supabase
          .from('players')
          .update({ crm_spend_custom: spent })
          .eq('user_id', p.user_id);
        stats.success++;
      } catch (e) {
        stats.failed++;
      }
    }));
    if (i+3 < filtered.length) await new Promise(r => setTimeout(r, 2000));
  }

  console.log('CUSTOM SYNC DONE', stats);
  return { success: true, stats };
}

module.exports.syncCustomRangeSpending = syncCustomRangeSpending;
