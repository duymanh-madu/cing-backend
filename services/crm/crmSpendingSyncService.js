const supabase = require('../../supabase');
const foodbook = require('../foodbook');

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
    log_type:    'PAY',
    create_from: from,
    create_to:   to,
    page_size:   500,
  });
  return result.data?.total_spent || 0;
}

function isPhoneId(userId) {
  return /^(0|84)\d{8,10}$/.test(String(userId));
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

    const [weekly, monthly, quarterly, yearly] = await Promise.all([
      fetchPeriodSpend(userId, periods.week.from,    periods.week.to),
      fetchPeriodSpend(userId, periods.month.from,   periods.month.to),
      fetchPeriodSpend(userId, periods.quarter.from, periods.quarter.to),
      fetchPeriodSpend(userId, periods.year.from,    periods.year.to),
    ]);

    // Lưu vào Supabase — timestamp dùng UTC chuẩn (Supabase tự xử lý)
    const { error } = await supabase
      .from('players')
      .update({
        crm_spend_alltime:   allTimeSpent,
        crm_spend_weekly:    weekly,
        crm_spend_monthly:   monthly,
        crm_spend_quarterly: quarterly,
        crm_spend_yearly:    yearly,
        crm_orders_alltime:  allTimeOrders,
        crm_synced_at:       new Date().toISOString(), // UTC — Supabase chuẩn
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Supabase error:', userId, error.message);
      return { user_id: userId, success: false };
    }

    console.log(`Synced ${memberData.name||userId}: all=${allTimeSpent} week=${weekly} month=${monthly}`);
    return { user_id: userId, success: true, allTimeSpent, weekly, monthly, quarterly, yearly };

  } catch (err) {
    console.error('syncOnePlayer error:', userId, err.message);
    return { user_id: userId, success: false, error: err.message };
  }
}

async function syncAllPlayersCrmSpending({ batchSize=3, delayMs=2000 } = {}) {
  console.log('START CRM SYNC... VN time:', fmtIpos(nowVN()));
  const t0 = Date.now();

  const { data: players, error } = await supabase
    .from('players')
    .select('user_id, zalo_name');

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
